(function () {
  const root = document.documentElement;
  const sectionReveal = {
    enterRatio: 0.82,
    exitRatio: 0.12,
  };
  let initialized = false;

  function getWeddingDateSource() {
    return (
      document.querySelector('.type-hero-date[data-wedding-date]') ||
      document.querySelector('.type-hero-date[datetime]') ||
      document.querySelector('.countdown[data-wedding-date]')
    );
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function pluralizeDays(days) {
    const mod10 = days % 10;
    const mod100 = days % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
    return 'дней';
  }

  function setupCountdown() {
    const countdown = document.querySelector('.countdown');
    if (!countdown) return;

    const dateSource = getWeddingDateSource();
    const targetString = dateSource
      ? dateSource.getAttribute('data-wedding-date') || dateSource.getAttribute('datetime')
      : '';
    const targetDate = new Date(targetString);
    if (Number.isNaN(targetDate.getTime())) return;

    const daysNode = countdown.querySelector('[data-unit="days"]');
    const hoursNode = countdown.querySelector('[data-unit="hours"]');
    const minutesNode = countdown.querySelector('[data-unit="minutes"]');
    const daysUnitNode = countdown.querySelector('.countdown__item .countdown__unit');

    function render() {
      const now = new Date();
      let diff = targetDate.getTime() - now.getTime();
      if (diff < 0) diff = 0;
      const totalMinutes = Math.floor(diff / 60000);
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const minutes = totalMinutes % 60;
      if (daysNode) daysNode.textContent = String(days);
      if (hoursNode) hoursNode.textContent = pad(hours);
      if (minutesNode) minutesNode.textContent = pad(minutes);
      if (daysUnitNode) daysUnitNode.textContent = pluralizeDays(days);
    }

    render();
    window.setInterval(render, 60000);
  }

  function setupSectionReveal() {
    const sections = Array.from(document.querySelectorAll('main > .section'));
    if (!sections.length) return;

    root.classList.add('js-enhanced');
    sections[0].classList.add('is-visible');

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sections.forEach((section) => section.classList.add('is-visible'));
      return;
    }

    let ticking = false;

    function updateVisibility() {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const enterLine = viewportHeight * sectionReveal.enterRatio;
      const exitLine = viewportHeight * sectionReveal.exitRatio;

      sections.forEach((section, index) => {
        if (index === 0) {
          section.classList.add('is-visible');
          return;
        }
        const rect = section.getBoundingClientRect();
        const shouldShow = rect.top <= enterLine && rect.bottom >= exitLine;
        section.classList.toggle('is-visible', shouldShow);
      });
      ticking = false;
    }

    function requestUpdate() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateVisibility);
      }
    }

    updateVisibility();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
  }

  function setupAllergyDetails() {
    const yesOption = document.querySelector('input[name="allergy"][value="Да"]');
    const noOption = document.querySelector('input[name="allergy"][value="Нет"]');
    const detailsGroup = document.getElementById('allergy-details-group');
    const detailsInput = document.getElementById('allergy-details');

    if (!detailsGroup || !detailsInput || (!yesOption && !noOption)) return;

    function syncAllergyDetails() {
      const isVisible = !!(yesOption && yesOption.checked);
      detailsGroup.classList.toggle('is-hidden', !isVisible);
      detailsGroup.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
      detailsInput.required = isVisible;
      detailsInput.disabled = !isVisible;
      if (!isVisible) {
        detailsInput.value = '';
      }
    }

    [yesOption, noOption].forEach((node) => {
      if (!node) return;
      node.addEventListener('change', syncAllergyDetails);
    });

    syncAllergyDetails();
  }

  function setupRsvpForm() {
    const form = document.querySelector('.rsvp-form');
    if (!form) return;

    const submitButton = form.querySelector('button[type="submit"]');
    const statusNode = form.querySelector('[data-form-status]');
    const formControls = Array.from(form.querySelectorAll('input, button, select, textarea'));
    let isPending = false;
    let isSubmitted = false;

    function setStatus(state, message) {
      if (!statusNode) return;
      if (state) {
        statusNode.dataset.state = state;
      } else {
        delete statusNode.dataset.state;
      }
      statusNode.textContent = message || '';
    }

    function setPending(nextPending) {
      isPending = nextPending;
      if (submitButton) submitButton.disabled = nextPending || isSubmitted;
      form.classList.toggle('is-pending', nextPending);
    }

    function lockFormAfterSuccess() {
      isSubmitted = true;
      form.classList.add('is-submitted');
      formControls.forEach((control) => {
        control.disabled = true;
      });
    }

    function collectPayload() {
      const fullName = (form.querySelector('[name="guest_name"]')?.value || '').trim();
      const familyDetails = (form.querySelector('[name="guest_family"]')?.value || '').trim();
      const attendance = form.querySelector('input[name="attendance"]:checked')?.value || '';
      const drinks = Array.from(form.querySelectorAll('input[name="drinks"]:checked')).map((input) => input.value);
      const allergy = form.querySelector('input[name="allergy"]:checked')?.value || '';
      const allergyDetails = (form.querySelector('[name="allergy_details"]')?.value || '').trim();
      const musicTrack = (form.querySelector('[name="music_track"]')?.value || '').trim();
      return {
        full_name: fullName,
        family_details: familyDetails,
        attendance,
        drinks,
        allergy,
        allergy_details: allergyDetails,
        music_track: musicTrack,
      };
    }

    function getValidationMessage(payload) {
      if (!payload.full_name) return 'Пожалуйста, укажите имя и фамилию.';
      if (!payload.attendance) return 'Пожалуйста, выберите, сможете ли присутствовать.';
      if (payload.allergy === 'Да' && !payload.allergy_details) {
        return 'Пожалуйста, укажите информацию об аллергии.';
      }
      return '';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isPending || isSubmitted) return;
      const payload = collectPayload();
      const validationMessage = getValidationMessage(payload);
      if (validationMessage) {
        setStatus('error', validationMessage);
        return;
      }
      setPending(true);
      setStatus('pending', 'Отправляем ответ...');
      try {
        const response = await fetch('/api/rsvp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          const message = result?.message || (Array.isArray(result?.details) && result.details[0]?.message) || 'Не удалось сохранить ответ. Попробуйте ещё раз.';
          throw new Error(message);
        }
        lockFormAfterSuccess();
        setStatus('success', 'Спасибо, до встречи на Свадьбе');
      } catch (error) {
        setStatus('error', error?.message || 'Не удалось сохранить ответ. Попробуйте ещё раз.');
      } finally {
        setPending(false);
      }
    });
  }

  function onReady() {
    if (initialized) return;
    initialized = true;
    setupCountdown();
    setupSectionReveal();
    setupAllergyDetails();
    setupRsvpForm();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        document.body.classList.add('fonts-ready');
      });
    } else {
      document.body.classList.add('fonts-ready');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
})();
