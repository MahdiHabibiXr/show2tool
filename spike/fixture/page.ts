export const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Synthetic tasks</title></head><body>
<h1>Show2Tool synthetic fixture</h1><p>Test data only</p>
<button id="login">Login tenant A</button>
<label>Search <input id="query" value="alpha"></label><button id="search">Search tasks</button>
<label>Title <input id="title" value="fresh"></label><button id="create">Create task</button>
<pre id="output"></pre><script>
const output = document.querySelector('#output');
document.querySelector('#login').onclick = async () => { await fetch('/login', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenant:'A'})}); output.textContent='Logged in'; };
document.querySelector('#search').onclick = async () => { const r=await fetch('/api/tasks?q='+encodeURIComponent(document.querySelector('#query').value)); output.textContent=JSON.stringify(await r.json()); };
document.querySelector('#create').onclick = async () => { const csrf=await (await fetch('/api/csrf')).json(); const r=await fetch('/api/tasks',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf.token},body:JSON.stringify({title:document.querySelector('#title').value})}); const result=await r.json(); output.textContent=r.ok?'Created':JSON.stringify(result); };
</script></body></html>`;
