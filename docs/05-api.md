# I. API Structure

## I.1 Conventions

- **Base** `/api`. REST-ish, resource-first, verbs only where a state transition has no natural noun (`/verify`, `/forward`).
- **Every route** is `defineRoute(handler, { capabilities, rateLimit })` — the wrapper resolves the session, enforces capability and read-only, validates with Zod, serialises `Decimal` → number, and shapes errors. A handler that forgets authorization cannot exist, because the handler never sees an unauthenticated request.
- **Request validation** Zod schema per route in `src/lib/schemas/*`, shared verbatim with the client form. They sit in `lib` rather than `server` because a client component must be able to import them — that is the whole point of one schema for both sides.
- **Errors** consistent envelope, never a raw stack:
  ```json
  { "error": "Human-readable sentence.",
    "code": "GUARD_FAILED",
    "details": [{ "path": "documents", "message": "3 mandatory documents missing" }] }
  ```
- **Status codes** 200/201/204 · 400 validation · 401 no session · 403 capability or scope · 404 out of scope or absent · 409 guard failed / stale write / duplicate · 422 business rule · 429 rate limited · 503 adapter down.
- **Pagination** `?page=1&pageSize=25&sort=-updatedAt` → `{ data, page, pageSize, total, totalPages }`.
- **Idempotency** mutating financial routes accept `Idempotency-Key`; replay returns the original response.
- **Correlation** every request carries `x-correlation-id` (generated if absent) into logs, audit rows and outbox payloads.

## I.2 Endpoint inventory

### Auth — `/api/auth`
| Method | Path | Capability | Notes |
|---|---|---|---|
| POST | `/login` | public | Rate limited 5/15min per email+IP; records `LoginAttempt`; lockout after N |
| POST | `/logout` | session | Revokes the session row |
| POST | `/refresh` | session | Slides idle expiry, honours `absoluteUntil` |
| GET | `/me` | session | User + roles + capabilities + scope hints |
| POST | `/forgot-password` | public | Uniform response, always 200 |
| POST | `/reset-password` | public | Single-use token; revokes all sessions |
| POST | `/change-password` | session | Requires current password |

### Applications — `/api/applications`
| Method | Path | Capability |
|---|---|---|
| GET | `/` | `APPLICATION_VIEW` — list, filtered, scoped |
| POST | `/` | `APPLICATION_CREATE` — creates DRAFT, allocates number |
| GET | `/:id` | `APPLICATION_VIEW` — full aggregate for the detail page |
| GET | `/:id/summary` | `APPLICATION_VIEW` — header only, cheap poll |
| PATCH | `/:id/applicant` · `/property` · `/building` | `APPLICATION_EDIT` — section save |
| POST | `/:id/withdraw` | `APPLICATION_WITHDRAW` |
| DELETE | `/:id` | `APPLICATION_DELETE` — DRAFT only, soft |
| GET | `/:id/timeline` | `APPLICATION_VIEW` — merged workflow + document + fee + payment events |
| GET | `/:id/audit` | `AUDIT_VIEW` |

### Drawings — `/api/applications/:id/drawings`
| Method | Path | Capability |
|---|---|---|
| GET | `/` | `DRAWING_VIEW` — drawings with version history |
| POST | `/` | `DRAWING_UPLOAD` — multipart; creates version n+1, never overwrites |
| GET | `/:drawingId/versions` | `DRAWING_VIEW` |
| GET | `/versions/:versionId/download` | `DRAWING_DOWNLOAD` — issues a short-lived signed URL, audits |

### Scrutiny — `/api/scrutiny`
| Method | Path | Capability |
|---|---|---|
| POST | `/requests` | `SCRUTINY_REQUEST` — enqueue for a drawing version |
| GET | `/requests/:id` | `SCRUTINY_VIEW` — status poll |
| GET | `/results/:id` | `SCRUTINY_VIEW` — result + issues |
| GET | `/results/:id/report` | `SCRUTINY_VIEW` — signed PDF URL |
| POST | `/callback` | HMAC-signed, no session — provider callback |

There is deliberately **no override endpoint**. A failed scrutiny is answered by uploading a corrected drawing version, which creates a new request — see H.3.1.

### Documents — `/api/applications/:id/documents`
| Method | Path | Capability |
|---|---|---|
| GET | `/required` | `DOCUMENT_VIEW` — evaluated requirement list + completeness |
| GET | `/` | `DOCUMENT_VIEW` |
| POST | `/` | `DOCUMENT_UPLOAD` — multipart, creates version n+1 |
| GET | `/:docId/versions` | `DOCUMENT_VIEW` |
| GET | `/versions/:versionId/download` | `DOCUMENT_DOWNLOAD` — signed URL, audited |
| POST | `/:docId/verify` | `DOCUMENT_VERIFY` — accept or reject with remarks |

### Fees — `/api/applications/:id/fees`
| Method | Path | Capability |
|---|---|---|
| GET | `/` | `FEE_VIEW` — demands + line items |
| POST | `/calculate` | `FEE_VIEW` — **preview only, persists nothing** |
| POST | `/generate` | `FEE_GENERATE` — issues an immutable demand |
| POST | `/:demandId/cancel` | `FEE_GENERATE` — reason required |
| POST | `/:demandId/waive` | `FEE_WAIVE` |

### Payments — `/api/payments`
| Method | Path | Capability |
|---|---|---|
| GET | — | `PAYMENT_VIEW` — the register, scoped through the application |
| POST | `/initiate` | `PAYMENT_INITIATE` — body names a demand and nothing else; returns gateway handoff |
| GET | `/:id` | `PAYMENT_VIEW` — status and gateway ledger; changes nothing |
| POST | `/:id/verify` | `PAYMENT_INITIATE` or `PAYMENT_RECONCILE` — **server-side** verification; the return page calls this |
| POST | `/:id/cancel` | `PAYMENT_INITIATE` — asks the gateway first; a paid attempt becomes a receipt, not a cancellation |
| POST | `/webhook/:provider` | public + signature — idempotent on `(provider, externalId)` |
| GET | `/:id/receipt` | `PAYMENT_VIEW` — audited before the bytes leave |
| POST | `/reconcile` | `PAYMENT_RECONCILE` — manual sweep trigger |
| POST | `/gateway/mock/:ref` | `PAYMENT_INITIATE` — the demo gateway's buttons; 404 unless the mock driver is live |
| POST | `/:id/refund` | `PAYMENT_REFUND` — Phase 6 |

`/:id/verify` was specified as `PAYMENT_INITIATE` alone. It accepts `PAYMENT_RECONCILE` as well, because finance holds that and not the former, and "did this actually go through?" with an applicant on the telephone is their question to answer. It is deliberately NOT plain `PAYMENT_VIEW` — verification cannot invent a payment, but it can settle one, and settling credits a demand and can move an application to the department.

The webhook is the only unauthenticated write in the system, so it is also on the middleware's public path list. Authentication for it is the signature, checked by the driver before the route learns anything about the event.

### Workflow — `/api/workflow`
| Method | Path | Capability | Notes |
|---|---|---|---|
| GET | `/applications/:id/actions` | `WORKFLOW_VIEW` | **The action bar's only source.** Returns the current stage, the open task with its SLA, the history sequence, and the actions this user may perform now — each with its destination, its guard state and a reason when disabled. |
| POST | `/applications/:id/actions/:actionCode` | `WORKFLOW_VIEW` at the route; the real one is **derived per action** inside the engine | Body `{ remarks, attachments?, shortfall?, shortfallId?, expectedSequence? }` |
| GET | `/applications/:id/history` | `WORKFLOW_VIEW` | Every movement, oldest first |
| GET | `/applications/:id/shortfalls` | `SHORTFALL_VIEW` | Open and closed, with items and every response attempt |
| GET | `/tasks` | `WORKFLOW_VIEW` | Officer queue. `filter` · `q` · `stage` · `page` · `sort` · `dir`, and the counts behind the filter chips |
| POST | `/tasks/:id/claim` | `WORKFLOW_CLAIM_TASK` | Conditional update, 409 if taken, naming who took it |
| POST | `/tasks/:id/release` | `WORKFLOW_CLAIM_TASK` | The holder, or a supervisor |
| GET | `/tasks/:id/reassign` | `WORKFLOW_REASSIGN` | Officers who work at that stage, with their current load |
| POST | `/tasks/:id/reassign` | `WORKFLOW_REASSIGN` | Refuses a target who does not work at the file's stage |

`GET /actions` is what keeps §43's "no fake buttons" honest: the UI cannot invent an action, because it renders exactly what the engine returns, and the engine re-derives the same list on POST.

**Why the POST route carries only `WORKFLOW_VIEW`.** Which capability an action needs is CONFIGURATION — `workflow_actions.capabilityKey`, editable by an administrator. A list of capabilities on the route would be a second copy of that, and the two would drift. So the route admits anyone who may look at the workflow, and the engine refuses on the action's own requirement. That is also the only place that knows which action was asked for.

### Shortfalls — `/api/shortfalls`
| Method | Path | Capability |
|---|---|---|
| GET | `/` | `SHORTFALL_VIEW` — cross-application queue |
| GET | `/:id` | `SHORTFALL_VIEW` — items + resolution attempts |
| POST | `/:id/respond` | `SHORTFALL_RESPOND` — LTP answer |
| POST | `/:id/review` | `SHORTFALL_RESOLVE` — accept or reject |

Shortfalls are *raised* through the workflow action endpoint, not here — creation is an effect of a transition, so there is exactly one code path that can create one.

### Approvals — `/api/approvals`
| Method | Path | Capability |
|---|---|---|
| GET | `/orders/:id` | `ORDER_VIEW` |
| GET | `/orders/:id/pdf` | `ORDER_VIEW` — signed URL |
| POST | `/orders/:id/revoke` | `ORDER_REVOKE` |
| GET | `/verify/:code` | public — minimal payload, rate limited |

### Dashboards, reports, analytics
| Method | Path | Capability |
|---|---|---|
| GET | `/api/dashboard/ltp` · `/officer` · `/executive` | role-appropriate |
| GET | `/api/reports` | `REPORT_VIEW` — catalogue |
| GET | `/api/reports/:slug` | `REPORT_VIEW` — filtered, paginated |
| GET | `/api/reports/:slug/export?format=csv\|xlsx` | `REPORT_VIEW` — streamed, audited |
| GET | `/api/analytics/*` | `ANALYTICS_VIEW` |

### Notifications
| Method | Path | Capability |
|---|---|---|
| GET | `/api/notifications` | session |
| POST | `/api/notifications/:id/read` · `/read-all` | session |
| GET | `/api/notifications/preferences` · PUT | session |

### Administration — `/api/admin`
`users` · `roles` · `permissions` · `departments` · `offices` · `zones` · `application-types` · `workflows` · `workflows/:id/stages` · `workflows/:id/transitions` · `workflows/:id/publish` · `workflows/:id/validate` · `fee-structures` · `fee-structures/:id/preview` · `document-types` · `document-requirements` · `scrutiny-rules` · `sla-rules` · `holidays` · `notification-templates` · `notification-templates/:id/preview` · `notification-logs` · `integrations/:kind` · `integrations/:kind/test` · `master-data` · `settings` · `audit` · `jobs` · `jobs/:id/retry`

Each is the standard `GET / POST / GET :id / PATCH :id / DELETE :id` set behind its module capability.

### Operations
| Method | Path | Auth |
|---|---|---|
| GET | `/api/health` | public — liveness |
| GET | `/api/health/ready` | public — DB + storage + queue depth |
| POST | `/api/cron/sla-sweep` · `/outbox-dispatch` · `/payment-reconcile` · `/scrutiny-poll` | `CRON_SECRET` bearer |

## I.3 Rate limits

| Surface | Limit |
|---|---|
| `POST /auth/login` | 5 / 15 min per email+IP, then lockout |
| `POST /auth/forgot-password` | 3 / hour per email |
| File upload | 20 / hour per user |
| `POST /payments/initiate` | 10 / hour per application |
| Webhooks | 100 / min per provider IP |
| Public `verify/:code` | 30 / min per IP |
| Everything else | 300 / min per user |

Backed by a `RateLimiter` interface — in-memory for dev, Postgres or Redis in production.
