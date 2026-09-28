/* SherigSpace Interactive Video Player
 * Uses the YouTube IFrame Player API.
 *
 * Example:
 * const iv = new SherigInteractiveVideo({
 *   container: '#interactive-video',
 *   videoId: 'YOUTUBE_ID_OR_URL',
 *   questions: [{
 *     id: 'q1', timestamp: '00:45',
 *     question: 'What is this?', type: 'multiple_choice',
 *     options: ['A','B','C'], correctAnswer: 'B',
 *     explanation: 'B is correct.', points: 1
 *   }],
 *   onAnswer: result => saveAnswerToSupabase(result),
 *   onProgress: progress => saveProgressToSupabase(progress)
 * });
 */
(function (window) {
  'use strict';
  let apiPromise;

  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const oldReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof oldReady === 'function') try { oldReady(); } catch (_) {}
        resolve(window.YT);
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
        s.onerror = () => reject(new Error('Could not load YouTube IFrame API.'));
        document.head.appendChild(s);
      }
      setTimeout(() => { if (window.YT && window.YT.Player) resolve(window.YT); }, 0);
    });
    return apiPromise;
  }

  function youtubeId(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (/^[A-Za-z0-9_-]{6,}$/.test(raw) && !raw.includes('/')) return raw;
    try {
      const u = new URL(raw), host = u.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0];
      if (['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)) {
        if (u.searchParams.get('v')) return u.searchParams.get('v');
        const m = u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);
        if (m) return m[1];
      }
    } catch (_) {}
    return '';
  }

  function seconds(value) {
    if (typeof value === 'number') return Math.max(0, value);
    const p = String(value || '').split(':').map(Number);
    if (p.some(Number.isNaN)) return 0;
    if (p.length === 1) return Math.max(0, p[0]);
    if (p.length === 2) return Math.max(0, p[0] * 60 + p[1]);
    return Math.max(0, p[0] * 3600 + p[1] * 60 + p[2]);
  }

  function esc(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function styles() {
    if (document.getElementById('sherig-interactive-video-css')) return;
    const s = document.createElement('style');
    s.id = 'sherig-interactive-video-css';
    s.textContent = `
      .siv{position:relative;width:100%;aspect-ratio:16/9;min-height:280px;background:#071426;color:#fff;border-radius:14px;overflow:hidden}
      .siv-player{position:absolute;inset:0;width:100%;height:100%;background:#000}.siv-player iframe{width:100%!important;height:100%!important;border:0;display:block}
      .siv-fullscreen{position:absolute;right:12px;bottom:42px;z-index:40;width:44px;height:44px;border:0;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;font-size:23px;cursor:pointer}
      .siv:fullscreen,.siv:-webkit-full-screen{width:100vw;height:100vh;max-width:none;max-height:none;aspect-ratio:auto;border-radius:0}
      .siv:fullscreen .siv-player,.siv:-webkit-full-screen .siv-player{width:100%;height:100%}
      .siv-overlay{position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(4,12,25,.84);backdrop-filter:blur(4px)}
      .siv-overlay.open{display:flex}.siv-box{width:min(680px,100%);max-height:90%;overflow:auto;background:#fff;color:#172033;border-radius:16px;padding:24px;box-sizing:border-box}
      .siv-box h3{margin:0 0 10px;line-height:1.5}.siv-time{font-size:13px;font-weight:700;margin-bottom:10px;color:#9b7a22}
      .siv-option{display:block;width:100%;text-align:left;margin:8px 0;padding:12px;border:1px solid #d8dce4;border-radius:10px;background:#fff;cursor:pointer;font:inherit}.siv-option.selected{border-color:#b08a28;box-shadow:0 0 0 2px rgba(176,138,40,.12)}
      .siv-answer{width:100%;box-sizing:border-box;min-height:90px;padding:12px;border:1px solid #ccd2dc;border-radius:10px;font:inherit}
      .siv-actions{display:flex;justify-content:flex-end;margin-top:14px}.siv-btn{border:0;border-radius:9px;padding:10px 16px;background:#b08a28;color:#fff;font-weight:700;cursor:pointer}
      .siv-feedback{display:none;margin-top:12px;padding:12px;border-radius:10px;line-height:1.5}.siv-replay-note{margin-top:10px;padding:10px 12px;border-radius:9px;background:#fff7e6;color:#7a5712;font-size:13px;line-height:1.45}.siv-feedback.show{display:block}.siv-feedback.ok{background:#e9f8ef;color:#146b35}.siv-feedback.no{background:#fff0f0;color:#9b2020}
      .siv-progress{padding:8px 12px;font-size:12px;opacity:.85}
    `;
    document.head.appendChild(s);
  }

  class SherigInteractiveVideo {
    constructor(options) {
      this.o = options || {};
      this.el = typeof this.o.container === 'string' ? document.querySelector(this.o.container) : this.o.container;
      if (!this.el) throw new Error('SherigInteractiveVideo: container not found.');
      this.videoId = youtubeId(this.o.videoId || this.o.url);
      this.questions = (this.o.questions || []).map((q,i)=>({...q,_i:i,timestamp:seconds(q.timestamp ?? q.time ?? q.at),replayBefore:Math.max(0,Number(q.replayBefore ?? q.replay_before_seconds ?? this.o.replayBefore ?? 30)||0),requireCorrect:q.requireCorrect !== false && q.require_correct !== false})).sort((a,b)=>a.timestamp-b.timestamp);
      this.answered = new Set(); this.current = null; this.selected = null; this.last = -1; this.destroyed = false;
      this.isFullscreen = false;
      styles(); this.render(); this.init();
    }
    uid(n){ if(!this.base) this.base='siv_'+Math.random().toString(36).slice(2,9); return this.base+'_'+n; }
    render(){ this.el.innerHTML=`<div class="siv" id="${this.uid('root')}"><div class="siv-player" id="${this.uid('player')}"></div><button type="button" class="siv-fullscreen" id="${this.uid('fullscreen')}" title="Fullscreen" aria-label="Fullscreen">⛶</button><div class="siv-overlay" id="${this.uid('overlay')}"><div class="siv-box" id="${this.uid('box')}"></div></div><div class="siv-progress" id="${this.uid('progress')}">Interactive video</div></div>`; const b=document.getElementById(this.uid('fullscreen')); if(b)b.addEventListener('click',()=>this.toggleFullscreen()); this.fsHandler=()=>this.updateFullscreenState(); document.addEventListener('fullscreenchange',this.fsHandler); document.addEventListener('webkitfullscreenchange',this.fsHandler); }
    async init(){
      if(!this.videoId) return this.error('Please provide a valid YouTube URL or video ID.');
      try { const YT=await loadYouTubeAPI(); if(this.destroyed)return; this.player=new YT.Player(this.uid('player'),{videoId:this.videoId,playerVars:{rel:0,modestbranding:1,playsinline:1,enablejsapi:1,fs:0},events:{onReady:()=>this.ready(),onStateChange:e=>this.state(e),onError:e=>this.error('YouTube error: '+e.data)}}); }
      catch(e){this.error(e.message||'Unable to load YouTube.');}
    }
    ready(){ this.timer=setInterval(()=>this.tick(),250); if(this.o.onReady)this.o.onReady(this); }
    state(e){ if(this.o.onStateChange)this.o.onStateChange(e.data,this); if(e.data===window.YT.PlayerState.ENDED)this.progress(true); }
    tick(){
      if(!this.player||this.destroyed)return; let t=0; try{t=this.player.getCurrentTime()||0;}catch(_){return;}
      const q=this.questions.find(x=>!this.answered.has(String(x.id??x._i)) && t>=x.timestamp && t<=x.timestamp+1.25);
      if(q&&!this.current)this.ask(q);
      const d=this.player.getDuration?this.player.getDuration():0, pct=d?Math.min(100,t/d*100):0;
      const p=document.getElementById(this.uid('progress')); if(p)p.textContent=`Progress: ${Math.round(pct)}% · Questions: ${this.answered.size}/${this.questions.length}`;
      if(this.o.onProgress && Date.now()-(this.lastProgressAt||0)>5000){this.lastProgressAt=Date.now();this.progress(false,t,pct);}
      this.last=t;
    }
    ask(q){ this.current=q;this.selected=null;try{this.player.pauseVideo();}catch(_){};const ov=document.getElementById(this.uid('overlay')),box=document.getElementById(this.uid('box')); if(!ov||!box)return;
      const type=String(q.type||q.question_type||'multiple_choice').toLowerCase(); let body='';
      let opts=Array.isArray(q.options)?q.options:[]; if(typeof q.options==='string')try{opts=JSON.parse(q.options)}catch(_){opts=[]}
      if(['multiple_choice','mcq','image_choice'].includes(type)) body=opts.map(x=>`<button class="siv-option" data-a="${esc(x)}">${esc(x)}</button>`).join('');
      else if(['true_false','truefalse'].includes(type)) body='<button class="siv-option" data-a="true">True</button><button class="siv-option" data-a="false">False</button>';
      else if(type==='fill_blank') body=`<input class="siv-answer" id="${this.uid('answer')}" type="text" autocomplete="off" placeholder="Fill in the blank..."/>`;
      else body=`<textarea class="siv-answer" id="${this.uid('answer')}" placeholder="Type your answer..."></textarea>`;
      box.innerHTML=`<div class="siv-time">Question at ${this.format(q.timestamp)}</div><h3>${esc(q.question||'')}</h3><div>${body}</div><div class="siv-feedback" id="${this.uid('feedback')}"></div><div class="siv-actions"><button class="siv-btn" id="${this.uid('submit')}">Submit Answer</button></div>`;
      box.querySelectorAll('.siv-option').forEach(b=>b.onclick=()=>{box.querySelectorAll('.siv-option').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');this.selected=b.dataset.a;});
      document.getElementById(this.uid('submit')).onclick=()=>this.submit();ov.classList.add('open'); if(this.o.onQuestionShown)this.o.onQuestionShown(q,this);
    }
    format(s){s=Math.floor(s);const m=Math.floor(s/60),sec=String(s%60).padStart(2,'0');return `${String(m).padStart(2,'0')}:${sec}`;}
    normalize(v){return String(v??'').trim().toLowerCase().replace(/\s+/g,' ');}
    check(q,a){let accepted=[];if(Array.isArray(q.accepted_answers))accepted=accepted.concat(q.accepted_answers);if(q.correctAnswer!==undefined)accepted.push(q.correctAnswer);if(q.correct_answer!==undefined)accepted.push(q.correct_answer);return accepted.some(x=>this.normalize(x)===this.normalize(a));}
    async submit(){
      const q=this.current; if(!q)return; const type=String(q.type||q.question_type||'multiple_choice').toLowerCase(); let a=this.selected;
      if(!a&&!['multiple_choice','mcq','image_choice','true_false','truefalse'].includes(type)){const e=document.getElementById(this.uid('answer'));a=e?e.value.trim():'';}
      if(!a)return alert('Please select or enter an answer.');
      let checked;
      try{
        if(this.o.answerChecker) checked=await this.o.answerChecker({questionId:q.id??null,answer:a,question:q,player:this});
        else checked={isCorrect:this.check(q,a),points:Number(q.points??1)||0,maxPoints:Number(q.points??1)||0};
      }catch(e){console.error('answerChecker:',e);return alert('Could not check the answer. Please try again.');}
      const correct=!!checked.isCorrect, max=Number(checked.maxPoints??q.points??1)||0;
      const result={questionId:q.id??null,videoId:this.videoId,timestamp:q.timestamp,answer:a,isCorrect:correct,points:Number(checked.points??(correct?max:0))||0,maxPoints:max,answeredAt:new Date().toISOString()};
      const qKey=String(q.id??q._i);
      const f=document.getElementById(this.uid('feedback')),b=document.getElementById(this.uid('submit'));
      // Only mark the question as completed when the student is correct
      // (or when the question is configured not to require correctness).
      if(correct || !q.requireCorrect) this.answered.add(qKey);
      else this.answered.delete(qKey);
      const explanation=checked.explanation??q.explanation;
      if(f){f.className='siv-feedback show '+(correct?'ok':'no');f.innerHTML=`<strong>${correct?'✓ Correct!':'✗ Not quite.'}</strong>${explanation?`<div>${esc(explanation)}</div>`:''}${!correct&&q.requireCorrect?'<div class="siv-replay-note">Please watch the previous part again before answering. This question must be answered correctly to continue.</div>':''}`;}
      if(b){if(correct||!q.requireCorrect){b.textContent='Continue Video';b.onclick=()=>this.continue();}else{b.textContent='Watch Again';b.onclick=()=>this.replayQuestionSection();}}
      if(this.o.onAnswer)try{await this.o.onAnswer(result,q,this)}catch(e){console.error('onAnswer:',e);}
    }
    replayQuestionSection(){const q=this.current;if(!q)return;
      const qKey=String(q.id??q._i);
      // Make sure the question is eligible to appear again.
      this.answered.delete(qKey);
      const start=Math.max(0,q.timestamp-(q.replayBefore||30));const ov=document.getElementById(this.uid('overlay'));if(ov)ov.classList.remove('open');this.current=null;this.selected=null;this.last=start;
      try{this.player.seekTo(start,true);this.player.playVideo();}catch(_){}if(this.o.onReplay)try{this.o.onReplay({questionId:q.id??null,videoId:this.videoId,questionTime:q.timestamp,replayStart:start},this)}catch(e){console.error('onReplay:',e)}}
    continue(){const ov=document.getElementById(this.uid('overlay'));if(ov)ov.classList.remove('open');this.current=null;try{this.player.playVideo()}catch(_){};}
    async progress(completed,current,pct){const data={videoId:this.videoId,watchSeconds:Math.floor(current??this.last),completionPercentage:Number((pct??0).toFixed(2)),completed:!!completed,questionsAnswered:this.answered.size,questionsTotal:this.questions.length,updatedAt:new Date().toISOString()};if(this.o.onProgress)try{await this.o.onProgress(data,this)}catch(e){console.error('onProgress:',e);}}
    async toggleFullscreen(){
      const root=document.getElementById(this.uid('root'));
      if(!root)return;
      if(document.fullscreenElement||document.webkitFullscreenElement){
        if(document.exitFullscreen) await document.exitFullscreen();
        else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
      }
      try{
        if(root.requestFullscreen) await root.requestFullscreen();
        else if(root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      }catch(e){console.error('Fullscreen error:',e);}
    }
    updateFullscreenState(){
      const root=document.getElementById(this.uid('root'));
      const b=document.getElementById(this.uid('fullscreen'));
      if(!root||!b)return;
      const active=document.fullscreenElement===root||document.webkitFullscreenElement===root;
      this.isFullscreen=active;
      b.textContent='⛶';
      b.title=active?'Exit fullscreen':'Fullscreen';
    }

    error(msg){this.el.innerHTML=`<div style="padding:20px;background:#fff1f1;color:#8c1d1d;border-radius:10px">${esc(msg)}</div>`;}
    destroy(){this.destroyed=true;if(this.timer)clearInterval(this.timer);try{this.player?.destroy()}catch(_){};this.el.innerHTML='';}
  }

  window.SherigInteractiveVideo=SherigInteractiveVideo;
  window.SherigInteractiveVideoUtils={youtubeId,seconds,loadYouTubeAPI};
})(window);
