/* SherigSpace — shared helper: upload a video file to the admin's Google Drive.
   Used by the Contribute form (index.html) and the admin "Add video" form.

   How it works
   • If the `drive-upload` Supabase function is deployed (see DRIVE_UPLOAD_SETUP.md): files up to 300 MB,
     sent straight from the browser to Google Drive, PRIVATE until the admin approves them.
   • If it is not deployed: it falls back to the Google Drive upload that admin.html already uses
     (DRIVE_UPLOAD_URL in config.js) — works immediately, but only for files up to 25 MB.

   window.SherigDrive.upload(supabase, file, { purpose:'contribution'|'admin', onProgress(pct) }) → { fileId, viewUrl }
   window.SherigDrive.publish(supabase, urlOrId)  → admin: makes an uploaded file viewable by link (does nothing for other links) */
(function(){
  const BIG_MAX_MB = 300, LEGACY_MAX_MB = 25;
  const idOf = v => { const m = String(v||'').match(/drive\.google\.com\/file\/d\/([\w-]+)/); return m ? m[1] : (/^[\w-]{10,}$/.test(String(v||'')) ? String(v) : ''); };

  async function callFunction(supabase, body){
    const { data, error } = await supabase.functions.invoke('drive-upload', { body });
    if(error){
      let status = error.context && error.context.status, msg = error.message || '';
      try{ const j = await error.context.json(); if(j && j.error) msg = j.error; }catch(e){}
      const e = new Error(msg || 'Upload service is not available.');
      // function not deployed / unreachable → caller may fall back
      e.notDeployed = status === 404 || error.name === 'FunctionsFetchError' || /not found|failed to send a request/i.test(msg);
      throw e;
    }
    if(!data || data.ok === false) throw new Error((data && data.error) || 'Upload service is not available.');
    return data;
  }

  async function uploadLegacy(file, onProgress){
    if(file.size > LEGACY_MAX_MB*1024*1024) throw new Error('This video is over ' + LEGACY_MAX_MB + ' MB. Please upload a shorter video, or put it on YouTube as Unlisted and use the "YouTube / link" option.');
    const [drive, cfg] = await Promise.all([ import('./drive-upload.js'), import('./config.js') ]);
    if(onProgress) onProgress(5);
    const r = await drive.uploadFileToDrive(file, cfg.GOOGLE_CLIENT_ID);
    if(onProgress) onProgress(100);
    return { fileId: r.fileId, viewUrl: r.viewUrl || ('https://drive.google.com/file/d/' + r.fileId + '/view') };
  }

  async function upload(supabase, file, opts){
    opts = opts || {};
    if(!file) throw new Error('Please choose a video file.');
    if(!/^video\//i.test(file.type || '')) throw new Error('Please choose a video file (MP4, MOV, WebM…).');
    let init;
    try{
      if(file.size > BIG_MAX_MB*1024*1024) throw new Error('The video is too big. Please keep it under ' + BIG_MAX_MB + ' MB.');
      init = await callFunction(supabase, { action:'init', purpose: opts.purpose || 'contribution', fileName: file.name, mimeType: file.type, size: file.size, origin: location.origin });
    }catch(e){
      if(e.notDeployed) return uploadLegacy(file, opts.onProgress);   // upload function not set up yet → use the existing Drive uploader
      throw e;
    }
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', init.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = ev => { if(ev.lengthComputable && opts.onProgress) opts.onProgress(Math.round(ev.loaded / ev.total * 100)); };
      xhr.onerror = () => reject(new Error('The upload was interrupted. Check your internet connection and try again.'));
      xhr.onload = () => {
        if(xhr.status >= 200 && xhr.status < 300){ try{ resolve(JSON.parse(xhr.responseText)); }catch(e){ reject(new Error('Upload finished but Google gave an unexpected answer.')); } }
        else reject(new Error('Google Drive could not store the file (error ' + xhr.status + ').'));
      };
      xhr.send(file);
    });
    if(!result || !result.id) throw new Error('Upload finished but the file id is missing.');
    return { fileId: result.id, viewUrl: 'https://drive.google.com/file/d/' + result.id + '/view' };
  }

  async function publish(supabase, urlOrId){
    const id = idOf(urlOrId); if(!id) return { notOurs:true };
    try{ return await callFunction(supabase, { action:'publish', fileId: id }); }
    catch(e){ if(e.notDeployed) return { notOurs:true }; throw e; }
  }
  window.SherigDrive = { upload, publish, idOf, MAX_MB: BIG_MAX_MB, LEGACY_MAX_MB };
})();
