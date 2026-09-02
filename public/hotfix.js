(()=>{
  // Reliability hotfix: web-search/runner failures must never break basic chat.
  if (typeof orChat === 'function') {
    const baseOrChat = orChat;
    orChat = async function(messages, toolsList = []) {
      try {
        return await baseOrChat(messages, toolsList);
      } catch (firstError) {
        const wm = document.querySelector('#webMode');
        const previous = wm?.value;
        const message = String(firstError?.message || firstError || '');
        const retryable = previous && previous !== 'off' && /web|tool|credit|payment|provider|route|400|402|404|429|unsupported|invalid/i.test(message);
        if (!retryable) throw firstError;
        try {
          wm.value = 'off';
          const result = await baseOrChat(messages, toolsList);
          const status = document.querySelector('#status');
          if (status) status.textContent = 'Web検索を外して再試行しました';
          return result;
        } finally {
          if (wm && previous) wm.value = previous;
        }
      }
    };
  }

  // Make the Run button self-healing even if an addon script failed during startup.
  const send = document.querySelector('#send');
  if (send && typeof run === 'function' && typeof add === 'function') {
    send.onclick = async () => {
      const prompt = document.querySelector('#prompt');
      const text = prompt?.value.trim();
      if (!text) return;
      prompt.value = '';
      add('u', text);
      send.disabled = true;
      try {
        const out = await run(text);
        add('a', out);
      } catch (e) {
        if (typeof showErr === 'function') showErr(e);
        else alert('ForgeCodex error: ' + (e?.message || e));
      } finally {
        send.disabled = false;
      }
    };
  }
})();
