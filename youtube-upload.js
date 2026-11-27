/* SherigSpace — shared helper: upload a video file to the admin's YouTube channel (as an UNLISTED video).
   Used by the Contribute form (index.html).

   It needs the `youtube-upload` Supabase function (see YOUTUBE_UPLOAD_SETUP.md). If that is not set up,
   available() returns false and the Contribute form keeps using the Google Drive upload instead.

   window.SherigYouTube.available(supabase) → Promise<boolean>
   window.SherigYouTube.upload(supabase, file, { title, description, onProgress(pct) }) → { videoId, url } */
(function(){
  let readyCache = null;
  async function call(supabase, body){
    const { data, error } = await supabase.functions.invoke('youtube-upload', { body });
    if(error){
      let msg = error.message || '';
      try{ const j = await error.context.json(); if(j && j.error) msg = j.error; }catch(e){}
      throw new Error(msg || 'The YouTube upload service is not available.');
    }
    if(!data || data.ok === false) throw new Error((data && data.error) || 'The YouTube upload service is not available.');
    return data;
  }
  async function available(supabase){
    if(readyCache !== null) return readyCache;
    try{
      const d = await call(supabase, { action:'status' });
      readyCache = !!d.ready;
      if(!readyCache) window.SherigYouTube.reason = 'The function is running, but the three YOUTUBE_ secrets are not all set (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN).';
    }catch(e){
      readyCache = false;
      window.SherigYouTube.reason = 'The youtube-upload function did not answer: ' + (e.message || e);
      console.warn('[SherigYouTube]', window.SherigYouTube.reason);
    }
    return readyCache;
  }
  async function upload(supabase, file, opts){
    opts = opts || {};
    if(!file) throw new Error('Please choose a video file.');
    if(!/^video\//i.test(file.type || '')) throw new Error('Please choose a video file (MP4, MOV, WebM…).');
    const init = await call(supabase, { action:'init', fileName:file.name, mimeType:file.type, size:file.size,
                                        title:opts.title || file.name, description:opts.description || '', origin:location.origin });
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', init.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = ev => { if(ev.lengthComputable && opts.onProgress) opts.onProgress(Math.round(ev.loaded / ev.total * 100)); };
      xhr.onerror = () => reject(new Error('The upload was interrupted. Check your internet connection and try again.'));
      xhr.onload = () => {
        if(xhr.status >= 200 && xhr.status < 300){ try{ resolve(JSON.parse(xhr.responseText)); }catch(e){ reject(new Error('Upload finished but YouTube gave an unexpected answer.')); } }
        else reject(new Error('YouTube could not take the video (error ' + xhr.status + ').'));
      };
      xhr.send(file);
    });
    if(!result || !result.id) throw new Error('Upload finished but the video id is missing.');
    return { videoId: result.id, url: 'https://www.youtube.com/watch?v=' + result.id };
  }
  window.SherigYouTube = { available, upload, reason:'' };
})();
