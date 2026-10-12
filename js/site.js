/* BunNaNa site behaviour. Plain JS, no build step.
   Everything here is progressive enhancement: without JS the page shows German,
   all content is visible, the nav links are simply listed, the hours are the
   static text, and the forms fall back to their mailto: action. */
(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────────────────
     FORM_ENDPOINT: paste a POST endpoint here to send forms in the background,
     e.g. Formspree "https://formspree.io/f/xxxxxxxx" or a Netlify function.
     Leave empty and submitting opens a prefilled e-mail to SHOP_MAIL instead.
     When you paste an endpoint, also change the copy that promises the mail app:
     the .form-hint paragraph and the submit label "Anfrage per E-Mail senden"
     in index.html.
     HOURS: opening hours per weekday (0 = Sunday), in Europe/Berlin local time.
     Keep this in sync with the hours table in index.html.
     CLOSED_DATES: days the shop stays shut although HOURS says open (holidays,
     vacation, market days). One day is 'YYYY-MM-DD', a span is ['YYYY-MM-DD',
     'YYYY-MM-DD'] with both ends included, e.g.
       var CLOSED_DATES = ['2026-12-25', ['2026-12-31', '2027-01-06']];
     NOTICE: one optional dated line shown under the open status and above the
     hours table from `from` to `to` (both included), e.g.
       var NOTICE = { from: '2026-12-20', to: '2027-01-06',
                      de: 'Betriebsferien vom 31.12. bis 6.1.', en: 'Closed for holidays from 31 Dec to 6 Jan.' };
     Leave it null when there is nothing to announce. */
  var FORM_ENDPOINT = '';
  var SHOP_MAIL = 'info@bunnana.de';
  var SHOP_PHONE = '07121 / 1362690';
  var SHOP_TEL = 'tel:+4971211362690';
  var HOURS = { 0: null, 1: [11, 18.5], 2: [11, 18.5], 3: [11, 18.5], 4: [11, 18.5], 5: [11, 19], 6: [11, 19] };
  var CLOSED_DATES = [];
  var NOTICE = null;
  var DAYS = {
    de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  };

  function isEn() { return document.documentElement.lang === 'en'; }
  function t(de, en) { return isEn() ? en : de; }

  /* 1. Language toggle. Strings exist twice (<span data-lang="de|en">); CSS shows
        whichever matches <html lang>. JS flips the attribute, the buttons, any
        aria-label that carries data-aria-de / data-aria-en, and the alt text of
        every photo that carries data-alt-de / data-alt-en, and the placeholder of
        every field that carries data-ph-de / data-ph-en. */
  var langButtons = document.querySelectorAll('[data-langbtn]');
  var ariaNodes = document.querySelectorAll('[data-aria-de][data-aria-en]');
  var altNodes = document.querySelectorAll('[data-alt-de][data-alt-en]');
  var phNodes = document.querySelectorAll('[data-ph-de][data-ph-en]');
  function setLang(lang) {
    document.documentElement.lang = lang;
    langButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-langbtn') === lang ? 'true' : 'false');
    });
    ariaNodes.forEach(function (el) {
      el.setAttribute('aria-label', el.getAttribute(lang === 'en' ? 'data-aria-en' : 'data-aria-de'));
    });
    altNodes.forEach(function (el) {
      el.setAttribute('alt', el.getAttribute(lang === 'en' ? 'data-alt-en' : 'data-alt-de'));
    });
    phNodes.forEach(function (el) {
      el.setAttribute('placeholder', el.getAttribute(lang === 'en' ? 'data-ph-en' : 'data-ph-de'));
    });
    try { localStorage.setItem('bn-lang', lang); } catch (e) { /* storage unavailable */ }
    markToday();
  }
  langButtons.forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-langbtn')); });
  });
  var saved = null;
  try { saved = localStorage.getItem('bn-lang'); } catch (e) { /* storage unavailable */ }
  setLang(saved === 'en' ? 'en' : 'de');

  /* 2. Phone nav. The toggle button is only displayed below 720px (CSS). */
  var toggle = document.querySelector('.nav-toggle');
  var links = document.getElementById('nav-links');
  function closeNav() {
    toggle.setAttribute('aria-expanded', 'false');
    links.classList.remove('is-open');
  }
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      links.classList.toggle('is-open', open);
    });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) closeNav(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('is-open')) { closeNav(); toggle.focus(); }
    });
  }

  /* 3. Open-now status in the hero, computed from HOURS and CLOSED_DATES in
        Europe/Berlin time. The static hours line stays in the markup as the
        no-JS fallback. */
  var status = document.getElementById('bn-open');
  function berlinNow() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Berlin', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date());
      var map = {};
      parts.forEach(function (p) { map[p.type] = p.value; });
      var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(map.weekday);
      var hour = parseInt(map.hour, 10) % 24 + parseInt(map.minute, 10) / 60;
      if (day < 0 || isNaN(hour)) return null;
      return { day: day, hour: hour, date: map.year + '-' + map.month + '-' + map.day };
    } catch (e) { return null; }
  }
  /* Dates are 'YYYY-MM-DD' strings, so plain string comparison orders them. */
  function addDays(date, n) {
    var p = date.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10);
  }
  function isClosedDate(date) {
    return CLOSED_DATES.some(function (c) {
      return typeof c === 'string' ? c === date : (date >= c[0] && date <= c[1]);
    });
  }
  function hoursOn(day, date) { return isClosedDate(date) ? null : HOURS[day]; }
  function fmt(h) {
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function nextOpening(now) {
    for (var i = 1; i <= 60; i++) {
      var d = (now.day + i) % 7, date = addDays(now.date, i), h = hoursOn(d, date);
      if (h) return { day: d, open: h[0], inDays: i, date: date };
    }
    return null;
  }
  var MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayMonth(date, en) {
    var p = date.split('-');
    return en ? +p[2] + ' ' + MONTHS_EN[+p[1] - 1] : +p[2] + '.' + +p[1] + '.';
  }
  function span(lang, text) {
    var el = document.createElement('span');
    el.setAttribute('data-lang', lang); el.setAttribute('lang', lang);
    el.textContent = text;
    return el;
  }
  function renderStatus() {
    if (!status) return;
    var now = berlinNow();
    if (!now) return;
    var today = hoursOn(now.day, now.date);
    var de, en, state;
    if (today && now.hour >= today[0] && now.hour < today[1]) {
      state = 'open';
      de = 'Jetzt geöffnet, heute bis ' + fmt(today[1]);
      en = 'Open now, until ' + fmt(today[1]) + ' today';
    } else if (today && now.hour < today[0]) {
      state = 'closed';
      de = 'Heute ab ' + fmt(today[0]) + ' geöffnet';
      en = 'Opens today at ' + fmt(today[0]);
    } else {
      state = 'closed';
      var nx = nextOpening(now);
      if (!nx) return;
      var whenDe = nx.inDays === 1 ? 'morgen' : nx.inDays < 7 ? DAYS.de[nx.day] : 'am ' + dayMonth(nx.date);
      var whenEn = nx.inDays === 1 ? 'tomorrow' : nx.inDays < 7 ? DAYS.en[nx.day] : 'on ' + dayMonth(nx.date, true);
      /* "Heute geschlossen" only when the shop does not open at all today;
         after closing time it is "Jetzt geschlossen". */
      var whyDe = today ? 'Jetzt geschlossen' : (now.day === 0 && !isClosedDate(now.date) ? 'Sonntag geschlossen' : 'Heute geschlossen');
      var whyEn = today ? 'Closed now' : (now.day === 0 && !isClosedDate(now.date) ? 'Closed on Sundays' : 'Closed today');
      de = whyDe + ', ' + whenDe + ' ab ' + fmt(nx.open);
      en = whyEn + ', opens ' + whenEn + ' at ' + fmt(nx.open);
    }
    var text = status.querySelector('.open-text');
    text.textContent = '';
    text.appendChild(span('de', de));
    text.appendChild(span('en', en));
    status.setAttribute('data-state', state);
    renderNotice(now);
  }
  function renderNotice(now) {
    var show = !!(NOTICE && now.date >= NOTICE.from && now.date <= NOTICE.to);
    ['bn-notice-hero', 'bn-notice'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = '';
      el.hidden = !show;
      if (!show) return;
      el.appendChild(span('de', NOTICE.de));
      el.appendChild(span('en', NOTICE.en));
    });
  }
  function markToday() {
    var now = berlinNow();
    if (!now) return;
    document.querySelectorAll('.hours tr[data-day]').forEach(function (tr) {
      var isToday = parseInt(tr.getAttribute('data-day'), 10) === now.day;
      tr.classList.toggle('is-today', isToday);
      var th = tr.querySelector('th');
      var word = HOURS[now.day] && isClosedDate(now.date) ? t('heute geschlossen', 'closed today') : t('heute', 'today');
      if (th) { if (isToday) th.setAttribute('data-today', word); else th.removeAttribute('data-today'); }
    });
  }
  renderStatus();
  markToday();
  setInterval(function () { renderStatus(); markToday(); }, 60000);

  /* 4. Catering chips prime the contact form and land on what they changed: the
        two format chips preselect the format radio, the two occasion chips prefill
        the message with "Anlass: " and put the cursor behind it. A second occasion
        chip replaces the first one's prefill; a message the visitor typed is never
        overwritten. Without JS the chips are plain links to #kontakt. */
  function landOn(el) {
    /* Own history entry, so Back returns to the catering panel. */
    try { history.pushState(null, '', '#kontakt'); } catch (err) { /* file:// or blocked */ }
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
  }
  document.querySelectorAll('.chip[data-format]').forEach(function (chip) {
    chip.addEventListener('click', function (e) {
      var radio = document.querySelector('#bn-contact-form input[name="format"][data-format="' + chip.getAttribute('data-format') + '"]');
      if (!radio) return;
      e.preventDefault();
      radio.checked = true;
      radio.focus({ preventScroll: true });
      landOn(radio.closest('.choice') || radio);
    });
  });
  var ANLASS = {
    Kindergeburtstag: { de: 'Kindergeburtstag', en: "Kids' birthday" },
    Firmenfeier: { de: 'Firmenfeier', en: 'Company event' }
  };
  document.querySelectorAll('.chip[data-anlass]').forEach(function (chip) {
    chip.addEventListener('click', function (e) {
      var msg = document.getElementById('bn-msg');
      if (!msg) return;
      e.preventDefault();
      if (msg.value.trim() === '' || msg.value === msg.getAttribute('data-prefill')) {
        var key = chip.getAttribute('data-anlass');
        var name = ANLASS[key];
        msg.value = (name ? t(name.de, name.en) : key) + ': ';
        msg.setAttribute('data-prefill', msg.value);
        msg.dispatchEvent(new Event('input', { bubbles: true }));
      }
      msg.focus({ preventScroll: true });
      try { msg.setSelectionRange(msg.value.length, msg.value.length); } catch (err) { /* not supported */ }
      landOn(msg);
    });
  });

  /* The marquee pauses on hover (CSS); on touch a tap stops and restarts it. */
  var marquee = document.querySelector('.marquee');
  if (marquee) marquee.addEventListener('click', function () { marquee.classList.toggle('is-paused'); });

  /* 5. Scroll reveals. CSS hides [data-reveal] only when <html class="js">;
        reduced-motion users get everything visible via CSS, so we skip the observer. */
  var reveals = document.querySelectorAll('[data-reveal]');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* 6. Forms. Validate, then either POST to FORM_ENDPOINT or open a prefilled e-mail.
        opts.sie switches the status copy to the formal register (catering form). */
  function setNote(note, text, state) {
    note.textContent = text;
    if (state) note.setAttribute('data-state', state); else note.removeAttribute('data-state');
  }
  /* Same, for a note with tappable fallbacks: parts are strings or { href, text }. */
  function setNoteParts(note, parts, state) {
    note.textContent = '';
    parts.forEach(function (p) {
      if (typeof p === 'string') { note.appendChild(document.createTextNode(p)); return; }
      var a = document.createElement('a');
      a.href = p.href; a.textContent = p.text;
      note.appendChild(a);
    });
    note.setAttribute('data-state', state);
  }
  var MAIL_LINK = { href: 'mailto:' + SHOP_MAIL, text: SHOP_MAIL };
  var PHONE_LINK = { href: SHOP_TEL, text: SHOP_PHONE };
  /* Required text that is only spaces, or only the "Anlass: " a chip put there,
     is still an empty field. */
  function isBlank(el) {
    if (!el.required || el.type === 'email' || el.type === 'number') return false;
    var v = el.value.trim();
    var prefill = el.getAttribute('data-prefill');
    return v === '' || (!!prefill && v === prefill.trim());
  }
  function labelText(el) {
    var lab = el.labels && el.labels[0];
    if (!lab) return '';
    var forLang = lab.querySelector('[data-lang="' + document.documentElement.lang + '"]');
    return (forLang || lab).textContent.trim();
  }
  function persons(n) { return n === '1' ? '1 Person' : n + ' Personen'; }
  function guests(n) { return n === '1' ? '1 guest' : n + ' guests'; }
  function fieldMessage(el, sie) {
    var label = labelText(el);
    if (el.validity.valueMissing || isBlank(el)) {
      return isEn() ? 'Please fill in "' + label + '".' : (sie ? 'Bitte füllen Sie „' + label + '“ aus.' : 'Bitte „' + label + '“ ausfüllen.');
    }
    if (el.type === 'number' && el.validity.rangeUnderflow) {
      return isEn() ? 'Please enter at least ' + guests(el.min) + '.'
                    : (sie ? 'Bitte geben Sie mindestens ' + persons(el.min) + ' an.' : 'Bitte mindestens ' + persons(el.min) + ' angeben.');
    }
    if (el.type === 'number' && el.validity.rangeOverflow) {
      return isEn() ? 'Please enter at most ' + guests(el.max) + '.'
                    : (sie ? 'Bitte geben Sie höchstens ' + persons(el.max) + ' an.' : 'Bitte höchstens ' + persons(el.max) + ' angeben.');
    }
    if (el.type === 'date' && el.validity.rangeUnderflow) {
      return isEn() ? 'That date is in the past. Please choose today or a later day.'
                    : (sie ? 'Das Datum liegt in der Vergangenheit. Bitte wählen Sie heute oder einen späteren Tag.' : 'Das Datum liegt in der Vergangenheit. Bitte heute oder später wählen.');
    }
    if (el.type === 'date' && el.validity.badInput) {
      return isEn() ? 'Please choose a valid date.' : 'Bitte ein gültiges Datum wählen.';
    }
    if (el.type === 'email') {
      if (el.value.indexOf('@') === -1) {
        return isEn() ? 'The e-mail address needs an @, for example name@example.com.' : 'Die E-Mail-Adresse braucht ein @, zum Beispiel name@beispiel.de.';
      }
      return isEn() ? 'The e-mail address is incomplete. It needs a name, an @ and a domain, for example name@example.com.'
                    : 'Die E-Mail-Adresse ist unvollständig. Sie braucht einen Namen, ein @ und eine Domain, zum Beispiel name@beispiel.de.';
    }
    return isEn() ? 'Please check "' + label + '".' : (sie ? 'Bitte prüfen Sie „' + label + '“.' : 'Bitte „' + label + '“ prüfen.');
  }

  /* Inline error under the field it belongs to. The <p> is created on demand and
     removed again when the field turns valid, so nothing empty is left in the
     accessibility tree. It carries no live-region role on purpose: the first
     invalid field receives focus and its aria-describedby reads the message, so
     four simultaneous alerts are avoided. */
  function errorSlot(el) {
    var found = document.getElementById(el.id + '-err');
    if (found) return found;
    var p = document.createElement('p');
    p.className = 'field-error';
    p.id = el.id + '-err';
    var field = el.closest('.field');
    if (field) el.parentNode.insertBefore(p, el.nextSibling);
    else if (el.form && el.form.parentNode) el.form.parentNode.insertBefore(p, el.form.nextSibling);
    else return null;
    return p;
  }
  function setFieldError(el, text) {
    el.setAttribute('aria-invalid', 'true');
    var p = errorSlot(el);
    if (!p) return;
    p.textContent = text;
    el.setAttribute('aria-describedby', p.id);
  }
  function clearFieldError(el) {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
    var p = document.getElementById(el.id + '-err');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }
  function localDate(iso) {
    var p = iso.split('-');
    return isEn()
      ? new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      : +p[2] + '.' + +p[1] + '.' + p[0];
  }
  function choiceText(radio) {
    var lab = radio.nextElementSibling;
    var forLang = lab && lab.querySelector('[data-lang="' + document.documentElement.lang + '"]');
    return ((forLang || lab || radio).textContent || radio.value).trim();
  }
  /* "40 Personen, 12.11.2026, Foodtruck": what the catering form is handing over,
     repeated in the delivery note so the host can check it at a glance. */
  function enquirySummary(form) {
    var parts = [];
    var n = form.querySelector('[name="personen"]');
    if (n && n.value) parts.push(isEn() ? guests(n.value) : persons(n.value));
    var d = form.querySelector('[name="datum"]');
    if (d && d.value) parts.push(localDate(d.value));
    var f = form.querySelector('[name="format"]:checked');
    if (f) parts.push(f.getAttribute('data-format') === 'offen' ? t('Format noch offen', 'format not decided yet') : choiceText(f));
    return parts.length ? ' (' + parts.join(', ') + ')' : '';
  }
  /* The mail draft the host sees in their own mail app: a short letter in the
     page language, not raw field names. */
  var LETTER = [['name', 'Name', 'Name'], ['email', 'E-Mail', 'E-mail'], ['telefon', 'Telefon für Rückruf', 'Phone for a call back'],
                ['personen', 'Personen', 'Guests'], ['datum', 'Datum', 'Date'], ['format', 'Format', 'Format']];
  function enquiryLetter(form) {
    var lines = [t('Guten Tag,', 'Hello,'), '', t('ich möchte Catering bei BunNaNa anfragen.', 'I would like to ask about catering from BunNaNa.'), ''];
    LETTER.forEach(function (row) {
      var el = form.querySelector(row[0] === 'format' ? '[name="format"]:checked' : '[name="' + row[0] + '"]');
      if (!el || !String(el.value).trim()) return;
      var v = row[0] === 'datum' ? localDate(el.value) : row[0] === 'format' ? choiceText(el) : el.value.trim();
      lines.push(t(row[1], row[2]) + ': ' + v);
    });
    var msg = form.querySelector('[name="message"]');
    if (msg && msg.value.trim()) lines.push('', msg.value.trim());
    return lines.join('\n');
  }
  function bindForm(opts) {
    var form = document.getElementById(opts.form);
    var note = document.getElementById(opts.note);
    if (!form || !note) return;
    var btn = form.querySelector('button[type="submit"]');
    var busy = false;
    var sie = !!opts.sie;
    var dateField = form.querySelector('input[type="date"]');
    if (dateField) { var nowB = berlinNow(); if (nowB) dateField.min = nowB.date; }

    function clearInvalid() {
      form.querySelectorAll('.input').forEach(clearFieldError);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      clearInvalid();
      var first = null;
      form.querySelectorAll('.input').forEach(function (el) {
        if (isBlank(el) || !el.checkValidity()) {
          setFieldError(el, fieldMessage(el, sie));
          if (!first) first = el;
        }
      });
      if (first) {
        /* The message sits at the field. The status line stays for delivery only. */
        setNote(note, '');
        first.focus();
        return;
      }
      var subject = t(opts.subjectDe, opts.subjectEn);
      var data = new FormData(form);
      var what = opts.summary ? enquirySummary(form) : '';

      if (!FORM_ENDPOINT) {
        window.location.href = 'mailto:' + SHOP_MAIL +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(enquiryLetter(form));
        /* Honest about the hand-off: the draft is in the mail app, it is not sent yet. */
        setNoteParts(note, isEn()
          ? ['Your enquiry' + what + ' is now a draft in your e-mail app. Please press send there. Nothing opened? Write to ', MAIL_LINK, ' or call ', PHONE_LINK, '.']
          : ['Ihre Anfrage' + what + ' liegt jetzt als Entwurf in Ihrem E-Mail-Programm. Bitte dort noch auf Senden tippen. Hat sich nichts geöffnet? Schreiben Sie an ', MAIL_LINK, ' oder rufen Sie an: ', PHONE_LINK, '.'], 'info');
        return;
      }

      busy = true;
      if (btn) btn.disabled = true;
      setNote(note, t('Wird gesendet …', 'Sending …'), 'info');
      data.append('_subject', subject);
      data.append('_language', document.documentElement.lang);
      fetch(FORM_ENDPOINT, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); })
        .then(function () {
          form.reset();
          setNote(note, t(opts.okDe, opts.okEn).replace('{what}', what), 'ok');
        })
        .catch(function () {
          setNoteParts(note, isEn()
            ? ['Sending failed. Call us on ', PHONE_LINK, ' or write to ', MAIL_LINK, '.']
            : ['Das Senden hat nicht geklappt. Rufen Sie uns an: ', PHONE_LINK, ', oder schreiben Sie an ', MAIL_LINK, '.'], 'error');
        })
        .then(function () { busy = false; if (btn) btn.disabled = false; });
    });
    /* The delivery note stays until the next submit; typing only clears the
       error of the field being corrected. */
    form.addEventListener('input', function (e) {
      if (busy) return;
      if (e.target && e.target.getAttribute && e.target.getAttribute('aria-invalid')) {
        if (!isBlank(e.target) && e.target.checkValidity()) clearFieldError(e.target);
      }
    });
  }

  bindForm({ form: 'bn-contact-form', note: 'bn-sent-note', sie: true, summary: true,
             subjectDe: 'Catering-Anfrage über bunnana.de', subjectEn: 'Catering enquiry via bunnana.de',
             okDe: 'Danke, Ihre Anfrage{what} ist bei uns angekommen. Wir melden uns mit einem Angebot.',
             okEn: 'Thank you, your enquiry{what} has reached us. We will reply with a quote.' });
})();
