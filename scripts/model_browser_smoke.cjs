const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(process.env.MED_RESEARCH_URL || 'http://127.0.0.1:8000/research/');
    await page.waitForFunction(()=>document.querySelector('#snapshot-status').textContent.includes('225'));
    const parity=await page.evaluate(async()=>{
      const samples=await (await fetch('./model/parity-fixtures.json')).json();
      const worker=new Worker('./model-worker.js',{type:'module'});
      const result=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Model parity timeout')),120000);
        worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message))};
        worker.onmessage=e=>{if(e.data.type==='error'){clearTimeout(timer);reject(new Error(e.data.error))}if(e.data.type==='result'){clearTimeout(timer);resolve(e.data)}};
        worker.postMessage({id:1,type:'encode',texts:samples.map(x=>x.text)});
      });
      worker.terminate();
      return samples.map((s,i)=>{
        const v=result.embeddings[i];let dot=0,a=0,b=0;
        for(let k=0;k<v.length;k++){dot+=v[k]*s.embedding[k];a+=v[k]*v[k];b+=s.embedding[k]*s.embedding[k]}
        return dot/Math.sqrt(a*b);
      });
    });
    console.log('Browser/CPU cosines',JSON.stringify(parity));
    assert.ok(Math.min(...parity)>0.995, 'Browser/CPU exported model parity');
    await page.locator('#activate-model').click();
    await page.waitForFunction(()=>document.querySelector('#model-status').textContent.includes('Model ready'),{},{timeout:120000});
    await page.locator('#topic-input').fill('asthma');
    for(const route of ['semantic','hybrid']){
      await page.locator('#route-select').selectOption(route);
      await page.locator('#search-button').click();
      await page.waitForFunction(()=>document.querySelector('#search-status').classList.contains('success'),{},{timeout:60000});
      assert.ok(await page.locator('.paper-card').count()>0);
      assert.match(await page.locator('#search-status').innerText(),/225 eligible snapshot/);
    }
    assert.deepEqual(errors,[]);
    await page.locator('a.nav[data-view="map"]').click();
    await page.locator('#browse-findings').click();
    assert.equal(await page.locator('#graph-svg .graph-edge').count(),18);
    await page.locator('#graph-list button').first().click();
    assert.match(await page.locator('#edge-detail').innerText(),/Population/);
    assert.match(await page.locator('#edge-detail').innerText(),/NO INCREASE DETECTED/);
    assert.match(await page.locator('#edge-detail').innerText(),/NOT independently medically reviewed/);
    assert.ok(await page.locator('#edge-detail a').count()>0);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser_model_passed:true,min_exported_cpu_cosine:Math.min(...parity),tested:['six-text worker parity','actual trained model activation','all-snapshot semantic search','RRF60 hybrid search','nine contextual sourced findings and negative evidence'],browser_errors:errors}));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
