/* SherigSpace assignment interactive-video tools.
 * Teacher: timestamped question editor for YouTube links.
 * Student: mounts the existing SherigInteractiveVideo engine with assignment-scoped questions.
 */
(function(){
  let ytPromise = null;
  function loadYT(){
    if(window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if(ytPromise) return ytPromise;
    ytPromise = new Promise((resolve,reject)=>{
      const old = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function(){
        if(typeof old === 'function') old();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = ()=>reject(new Error('Could not load the YouTube player.'));
      document.head.appendChild(s);
    });
    return ytPromise;
  }
  function ytId(url){
    try{
      const u = new URL(url);
      const h = u.hostname.replace(/^www\./,'');
      if(h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || '';
      if(h.endsWith('youtube.com')){
        if(u.pathname === '/watch') return u.searchParams.get('v') || '';
        const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
        return m ? m[1] : '';
      }
    }catch(_){ }
    return '';
  }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function uid(){ return 'avq_' + Math.random().toString(36).slice(2,10); }
  function fmt(sec){ sec=Math.max(0,Number(sec)||0); const m=Math.floor(sec/60), s=Math.floor(sec%60); return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
  function parseList(v){ return String(v||'').split(/\n|,/).map(s=>s.trim()).filter(Boolean); }

  async function openEditor(attachment, opts){
    const videoId = ytId(attachment && attachment.url);
    if(!videoId) throw new Error('Only YouTube links can be made interactive right now.');
    opts = opts || {};
    let questions = Array.isArray(attachment.interactiveQuestions) ? attachment.interactiveQuestions.map(q=>({...q})) : [];
    const overlay = document.createElement('div');
    overlay.className = 'sav-editor-overlay';
    overlay.innerHTML = `
      <div class="sav-editor-modal">
        <div class="sav-editor-head">
          <div><strong>✨ Interactive Video</strong><div class="sav-editor-sub">${esc(attachment.label || 'YouTube video')}</div></div>
          <button type="button" class="sav-x" data-close>×</button>
        </div>
        <div class="sav-editor-grid">
          <div class="sav-player-wrap"><div id="${uid()}"></div><div class="sav-time" data-time>00:00</div></div>
          <div class="sav-side">
            <div class="sav-side-title">Questions</div>
            <div class="sav-q-list" data-list></div>
            <button type="button" class="sav-add" data-add>＋ Add question at current time</button>
          </div>
        </div>
        <div class="sav-form" data-form style="display:none"></div>
        <div class="sav-editor-foot">
          <span class="sav-hint">Play the video, pause where you want a question, then click <b>Add question</b>.</span>
          <div><button type="button" class="sav-cancel" data-close>Cancel</button><button type="button" class="sav-save" data-save>Save interactive questions</button></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const css = `
      .sav-editor-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:18px;font-family:DM Sans,Arial,sans-serif}
      .sav-editor-modal{width:min(1120px,96vw);max-height:94vh;overflow:auto;background:#151c2d;color:#e8e4dc;border:1px solid rgba(201,168,76,.35);border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.5)}
      .sav-editor-head,.sav-editor-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(201,168,76,.18)}
      .sav-editor-foot{border-top:1px solid rgba(201,168,76,.18);border-bottom:0}.sav-editor-sub,.sav-hint{font-size:12px;color:#9aa3b8;margin-top:3px}.sav-x{background:none;border:0;color:#e8e4dc;font-size:28px;cursor:pointer}
      .sav-editor-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.8fr);gap:14px;padding:14px}.sav-player-wrap{position:relative;background:#000;border-radius:10px;overflow:hidden;aspect-ratio:16/9}.sav-player-wrap>div:first-child{position:absolute;inset:0}.sav-player-wrap iframe{width:100%;height:100%}.sav-time{position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,.72);padding:4px 8px;border-radius:5px;font-size:12px}.sav-side{border:1px solid rgba(201,168,76,.18);border-radius:10px;padding:10px;display:flex;flex-direction:column;min-height:300px}.sav-side-title{font-weight:700;margin-bottom:8px}.sav-q-list{overflow:auto;display:flex;flex-direction:column;gap:7px;flex:1}.sav-q{padding:9px;border:1px solid rgba(201,168,76,.18);border-radius:8px;background:rgba(201,168,76,.05);cursor:pointer}.sav-q:hover{border-color:#c9a84c}.sav-q-top{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#c9a84c}.sav-q-text{font-size:13px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sav-q-del{float:right;border:0;background:none;color:#e05c5c;cursor:pointer}.sav-add,.sav-save,.sav-cancel{border:1px solid rgba(201,168,76,.35);border-radius:7px;padding:8px 11px;cursor:pointer;font-weight:600}.sav-add{background:rgba(201,168,76,.1);color:#e8c97a;margin-top:9px}.sav-save{background:#c9a84c;color:#15203a}.sav-cancel{background:transparent;color:#9aa3b8;margin-right:7px}.sav-form{margin:0 14px 14px;padding:12px;border:1px solid rgba(201,168,76,.2);border-radius:10px;background:rgba(255,255,255,.025)}.sav-fields{display:grid;grid-template-columns:1fr 170px;gap:9px}.sav-field{display:flex;flex-direction:column;gap:4px}.sav-field.full{grid-column:1/-1}.sav-field label{font-size:11px;color:#9aa3b8}.sav-field input,.sav-field select,.sav-field textarea{width:100%;padding:8px;border-radius:6px;border:1px solid rgba(201,168,76,.25);background:#202b4a;color:#e8e4dc}.sav-field textarea{min-height:70px;resize:vertical}.sav-check{display:flex;gap:7px;align-items:center;font-size:12px;margin-top:7px}@media(max-width:760px){.sav-editor-grid{grid-template-columns:1fr}.sav-fields{grid-template-columns:1fr}.sav-editor-foot{align-items:flex-start;flex-direction:column}}
    `;
    if(!document.getElementById('sav-editor-style')){ const st=document.createElement('style'); st.id='sav-editor-style'; st.textContent=css; document.head.appendChild(st); }

    const playerHost = overlay.querySelector('.sav-player-wrap > div:first-child');
    const timeEl = overlay.querySelector('[data-time]');
    const listEl = overlay.querySelector('[data-list]');
    const formEl = overlay.querySelector('[data-form]');
    let player = null, timer = null, editingIndex = -1;

    function renderList(){
      listEl.innerHTML = questions.length ? questions.map((q,i)=>`<div class="sav-q" data-qidx="${i}">
        <button type="button" class="sav-q-del" data-del="${i}">✕</button>
        <div class="sav-q-top"><span>${fmt(q.timestamp_seconds ?? q.timestamp ?? 0)}</span><span>${esc(q.question_type || 'multiple_choice')}</span></div>
        <div class="sav-q-text">${esc(q.question || 'Untitled question')}</div></div>`).join('') : '<div class="sav-hint">No questions yet.</div>';
      listEl.querySelectorAll('[data-qidx]').forEach(el=>el.addEventListener('click',()=>{
        const i=Number(el.dataset.qidx); if(player) player.seekTo(Number(questions[i].timestamp_seconds||0),true); showForm(i);
      }));
      listEl.querySelectorAll('[data-del]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();questions.splice(Number(el.dataset.del),1);editingIndex=-1;formEl.style.display='none';renderList();}));
    }
    function showForm(i){
      editingIndex=i; const q=questions[i];
      const type=q.question_type||'multiple_choice';
      const opts=Array.isArray(q.options)?q.options.join('\n'):'';
      const accepted=Array.isArray(q.accepted_answers)?q.accepted_answers.join('\n'):'';
      formEl.style.display='block';
      formEl.innerHTML=`<div class="sav-fields">
        <div class="sav-field full"><label>Question</label><input data-f-question value="${esc(q.question||'')}" placeholder="e.g. What is a LAN?"/></div>
        <div class="sav-field"><label>Question type</label><select data-f-type><option value="multiple_choice">Multiple choice</option><option value="true_false">True / False</option><option value="text">Short answer</option><option value="fill_blank">Fill in the blank</option></select></div>
        <div class="sav-field"><label>Timestamp</label><input data-f-time type="number" min="0" step="0.1" value="${Number(q.timestamp_seconds??q.timestamp??0)}"/></div>
        <div class="sav-field full"><label>Options (one per line, for multiple choice)</label><textarea data-f-options placeholder="Option A\nOption B\nOption C">${esc(opts)}</textarea></div>
        <div class="sav-field full"><label>Accepted answer(s), one per line</label><textarea data-f-accepted placeholder="For MC: exact correct option. For text/fill blank: one accepted answer per line.">${esc(accepted)}</textarea></div>
        <div class="sav-field"><label>Points</label><input data-f-points type="number" min="0" step="1" value="${Number(q.points??1)}"/></div>
        <div class="sav-field"><label>Replay previous seconds on wrong answer</label><input data-f-replay type="number" min="0" step="1" value="${Number(q.replay_before_seconds??30)}"/></div>
        <div class="sav-field full"><label>Explanation shown after answering</label><textarea data-f-explanation>${esc(q.explanation||'')}</textarea></div>
      </div><label class="sav-check"><input data-f-require type="checkbox" ${q.require_correct !== false ? 'checked':''}/> Student must answer correctly before continuing</label>`;
      formEl.querySelector('[data-f-type]').value=type;
      formEl.querySelector('[data-f-time]').addEventListener('change',()=>{q.timestamp_seconds=Math.max(0,Number(formEl.querySelector('[data-f-time]').value)||0);renderList();});
      formEl.querySelector('[data-f-type]').addEventListener('change',()=>{q.question_type=formEl.querySelector('[data-f-type]').value;});
      formEl.querySelectorAll('input,textarea,select').forEach(el=>{
        if(el.type==='checkbox') el.addEventListener('change',()=>q.require_correct=el.checked);
        else el.addEventListener('input',()=>syncForm());
      });
    }
    function syncForm(){
      if(editingIndex<0)return; const q=questions[editingIndex];
      q.question=formEl.querySelector('[data-f-question]').value.trim();
      q.question_type=formEl.querySelector('[data-f-type]').value;
      q.timestamp_seconds=Math.max(0,Number(formEl.querySelector('[data-f-time]').value)||0);
      q.options=parseList(formEl.querySelector('[data-f-options]').value);
      q.accepted_answers=parseList(formEl.querySelector('[data-f-accepted]').value);
      q.points=Math.max(0,Number(formEl.querySelector('[data-f-points]').value)||0);
      q.replay_before_seconds=Math.max(0,Number(formEl.querySelector('[data-f-replay]').value)||0);
      q.explanation=formEl.querySelector('[data-f-explanation]').value.trim();
      q.require_correct=formEl.querySelector('[data-f-require]').checked;
    }
    function addAtCurrent(){
      const t=player&&player.getCurrentTime?player.getCurrentTime():0;
      const q={id:(crypto.randomUUID?crypto.randomUUID():uid()),timestamp_seconds:Number(t.toFixed(1)),question:'',question_type:'multiple_choice',options:['',''],accepted_answers:[],explanation:'',points:1,replay_before_seconds:30,require_correct:true,enabled:true,sort_order:questions.length};
      questions.push(q); renderList(); showForm(questions.length-1); formEl.querySelector('[data-f-question]').focus();
    }
    function close(){clearInterval(timer);try{if(player)player.destroy();}catch(_){}overlay.remove();}
    overlay.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));
    overlay.querySelector('[data-add]').addEventListener('click',addAtCurrent);
    overlay.querySelector('[data-save]').addEventListener('click',()=>{syncForm();questions=questions.filter(q=>String(q.question||'').trim()).map((q,i)=>({...q,sort_order:i,enabled:true}));close(); if(opts.onSave)opts.onSave(questions);});
    renderList();
    try{
      const YT=await loadYT();
      player=new YT.Player(playerHost,{videoId,playerVars:{rel:0,modestbranding:1,playsinline:1,controls:1},events:{onReady:()=>{timer=setInterval(()=>{try{timeEl.textContent=fmt(player.getCurrentTime());}catch(_){}},200);}}});
    }catch(err){ overlay.remove(); throw err; }
    return new Promise(resolve=>{ opts._resolve=resolve; });
  }

  window.SherigAssignmentVideoEditor={open:openEditor};

  window.mountAssignmentInteractiveVideo = async function(host, options){
    if(!host || !window.SherigInteractiveVideo) throw new Error('Interactive video engine is not loaded.');
    const videoUrl=options.url;
    const questions=options.questions||[];
    const mount=document.createElement('div');
    host.innerHTML=''; host.appendChild(mount);
    const engine=new window.SherigInteractiveVideo({container:mount, videoId:videoUrl, questions:questions.map(q=>({
      ...q,
      timestamp:q.timestamp_seconds,
      replayBefore:q.replay_before_seconds,
      requireCorrect:q.require_correct !== false
    })),
      answerChecker: options.answerChecker ? async ctx => options.answerChecker(ctx) : undefined,
      onAnswer: async (result,q)=>{
        if(options.onAnswer) await options.onAnswer(result,q);
      },
      onProgress: async data=>{
        if(options.onProgress) await options.onProgress(data);
      }
    });
    return engine;
  };
})();
