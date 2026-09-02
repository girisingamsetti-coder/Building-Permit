const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

    await page.goto('http://localhost:3002/reports', { waitUntil: 'networkidle0' });
    
    const text = await page.evaluate(() => document.body.innerText);
    console.log('PAGE TEXT:', text);

    await browser.close();
  } catch (error) {
    console.error('PUPPETEER ERROR:', error);
  }
})();
