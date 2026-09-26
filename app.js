const SUPABASE_URL = 'https://zjvqbfmxaibjcdpttgmj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oZIVgG4DUG8zo6C1hoPkJA_x4YbnKkA';
const VAPID_PUBLIC_KEY = 'BMPjOZf-fOI24uFcNXu_0JPIuoTG5tkbBWBStOV26a4tAgV6sm3ZNO_uD2Ur1Rg1UD5jEPHHV4oMFqSaZze8SHg';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const fmtDate = d =>
  new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(d + 'T12:00:00'));

const esc = s =>
  String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));

const toast = msg => {
  const t = $('#toast');

  if (!t) {
    console.log(msg);
    return;
  }

  t.textContent = msg;
  t.classList.remove('hidden');

  setTimeout(() => {
    t.classList.add('hidden');
  }, 2200);
};

let session = null;
let profile = null;
let lessons = [];
let trialLessons = [];
let myBookings = [];
let isAdmin = false;
let myWaitlist = [];


/* =========================
   PROFIEL
========================= */

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id,name,email,rides,is_admin,credit_expires_at')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error(error);
    toast('Profiel kon niet worden geladen');
    return;
  }

  profile = data;
  isAdmin = !!data.is_admin;

  if (
    profile.credit_expires_at &&
    Number(profile.rides || 0) > 0 &&
    new Date(profile.credit_expires_at) < new Date()
  ) {
    const { error: expireError } = await supabaseClient
      .from('profiles')
      .update({ rides: 0 })
      .eq('id', session.user.id);

    if (expireError) {
      console.error(
        'Verlopen tegoed op 0 zetten mislukt:',
        expireError
      );
    } else {
      profile.rides = 0;
    }
  }
}


/* =========================
   LESSEN + INSCHRIJVINGEN
========================= */

async function loadData() {
  const today = new Date().toISOString().slice(0, 10);

  const [
    lessonResult,
    bookingResult,
    waitlistResult,
    announcementResult,
    trialLessonResult
  ] = await Promise.all([
    supabaseClient.rpc('get_lessons_with_counts'),

    supabaseClient
      .from('bookings')
      .select('lesson_id')
      .eq('user_id', session.user.id),

    supabaseClient
      .from('waitlist')
      .select('lesson_id')
      .eq('user_id', session.user.id),

    supabaseClient
      .from('announcements')
      .select('title,message,starts_at,ends_at,active,created_at')
      .eq('active', true)
      .lte('starts_at', today)
      .or(`ends_at.is.null,ends_at.gte.${today}`)
      .order('created_at', { ascending: false })
      .limit(1),

    supabaseClient
      .from('trial_lessons')
      .select('id,name,trial_date,trial_time')
      .gte('trial_date', today)
      .order('trial_date', { ascending: true })
  ]);

  if (lessonResult.error) {
    console.error(lessonResult.error);
    lessons = [];
  } else {
    lessons = lessonResult.data || [];
  }

  if (bookingResult.error) {
    console.error(bookingResult.error);
    myBookings = [];
  } else {
    myBookings = (bookingResult.data || []).map(x => x.lesson_id);
  }

  if (waitlistResult.error) {
    console.error(waitlistResult.error);
    myWaitlist = [];
  } else {
    myWaitlist = (waitlistResult.data || []).map(x => x.lesson_id);
  }

  if (trialLessonResult.error) {
    console.error(trialLessonResult.error);
    trialLessons = [];
  } else {
    trialLessons = trialLessonResult.data || [];
  }

  const announcementBox = $('#announcementBox');

  if (announcementBox) {
    if (announcementResult.error) {
      console.error(
        'Mededeling ophalen mislukt:',
        announcementResult.error
      );

      announcementBox.classList.add('hidden');

    } else if (
      announcementResult.data &&
      announcementResult.data.length > 0
    ) {
      const announcement = announcementResult.data[0];

      if ($('#announcementTitle')) {
        $('#announcementTitle').textContent = announcement.title;
      }

      if ($('#announcementMessage')) {
        $('#announcementMessage').textContent = announcement.message;
      }

      announcementBox.classList.remove('hidden');

    } else {
      announcementBox.classList.add('hidden');
    }
  }
}


/* =========================
   SCHERMEN
========================= */

function showLogin() {
  $('#loginView')?.classList.remove('hidden');
  $('#appView')?.classList.add('hidden');
  $('#adminView')?.classList.add('hidden');
  $('#resetPasswordView')?.classList.add('hidden');
  $('#logoutBtn')?.classList.add('hidden');
}


function showHomeScreenTip() {
  const tipAlreadySeen = localStorage.getItem('homeScreenTipSeen');

  if (tipAlreadySeen) return;

  setTimeout(() => {
    const message =
`📱 Zet DiegoSportCoach op je beginscherm

Zo heb je de app altijd snel bij de hand.

iPhone:
Safari → Delen → Zet op beginscherm → Voeg toe.

Android:
Chrome → ⋮ → Toevoegen aan startscherm / App installeren.

Lukt het niet? Vraag Diego voor of na de training even om hulp. 👍`;

    alert(message);

    localStorage.setItem('homeScreenTipSeen', 'yes');
  }, 500);
}


function showApp() {
  $('#loginView')?.classList.add('hidden');
  $('#resetPasswordView')?.classList.add('hidden');
  $('#appView')?.classList.remove('hidden');
  $('#adminView')?.classList.add('hidden');
  $('#logoutBtn')?.classList.remove('hidden');

  showHomeScreenTip();

  const adminButton = $('#adminTabBtn');

  if (adminButton) {
    adminButton.classList.toggle('hidden', !isAdmin);
  }

  render();
}


async function refreshSession() {
  const { data } = await supabaseClient.auth.getSession();

  session = data.session;

  if (!session) {
    showLogin();
    return;
  }

  await loadProfile();
  await loadData();

  showApp();
}


/* =========================
   ACCOUNT AANMAKEN
========================= */

async function signUp() {
  const name = $('#nameInput')?.value.trim();
  const email = $('#emailInput')?.value.trim().toLowerCase();
  const password = $('#passwordInput')?.value || '';

  if (!name || !email || password.length < 6) {
    toast('Vul naam, e-mail en minimaal 6 tekens wachtwoord in');
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name
      },
      emailRedirectTo:
        'https://diegosportcoachleiden.github.io/diegosportcoach-app/'
    }
  });

  if (error) {
    toast(error.message);
    return;
  }

  if (!data.session) {
    const authMsg = $('#authMsg');

    if (authMsg) {
      authMsg.textContent =
        'Account aangemaakt. Check je e-mail en druk op de bevestigingslink. Daarna kun je inloggen.';

      authMsg.classList.remove('hidden');
    }
  } else {
    await refreshSession();
  }
}


/* =========================
   INLOGGEN
========================= */

async function signIn() {
  const email = $('#emailInput')?.value.trim().toLowerCase();
  const password = $('#passwordInput')?.value || '';

  if (!email || !password) {
    toast('Vul e-mail en wachtwoord in');
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    toast('Inloggen mislukt: ' + error.message);
    return;
  }

  await refreshSession();
}


async function forgotPassword() {
  const email = $('#emailInput')?.value.trim();

  if (!email) {
    toast('Vul eerst je e-mailadres in');
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(
    email,
    {
      redirectTo:
        'https://diegosportcoachleiden.github.io/diegosportcoach-app/'
    }
  );

  if (error) {
    toast('Resetlink versturen mislukt: ' + error.message);
    return;
  }

  toast('Resetlink verstuurd! Controleer je e-mail.');
}


async function saveNewPassword() {
  const password = $('#newPasswordInput')?.value || '';

  if (password.length < 6) {
    toast('Wachtwoord moet minimaal 6 tekens zijn');
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({
    password
  });

  if (error) {
    toast('Wachtwoord wijzigen mislukt: ' + error.message);
    return;
  }

  toast('Wachtwoord succesvol gewijzigd!');

  $('#resetPasswordView')?.classList.add('hidden');
  $('#loginView')?.classList.remove('hidden');

  await supabaseClient.auth.signOut();
}


/* =========================
   UITLOGGEN
========================= */

async function signOut() {
  await supabaseClient.auth.signOut();

  session = null;
  profile = null;
  isAdmin = false;

  showLogin();
}


/* =========================
   APP TONEN
========================= */

function render() {
  if (!profile) return;

  const welcomeName = $('#welcomeName');

  if (welcomeName) {
    welcomeName.textContent =
      'Hoi ' +
      (profile.name || 'sportieveling').split(' ')[0] +
      '!';
  }

  const ridesCount = $('#ridesCount');

  if (ridesCount) {
    ridesCount.textContent = profile.rides || 0;
  }

  const ticketCount = $('#ticketCount');

  if (ticketCount) {
    ticketCount.textContent =
      (profile.rides || 0) +
      ' training' +
      (Number(profile.rides) === 1 ? '' : 'en');
  }

  const expiryEl = $('#creditExpiry');

  if (expiryEl) {
    if (
      profile.credit_expires_at &&
      Number(profile.rides || 0) > 0
    ) {
      const expiryDate = new Date(profile.credit_expires_at);

      expiryEl.textContent =
        'Geldig t/m: ' +
        expiryDate.toLocaleDateString('nl-NL', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
    } else {
      expiryEl.textContent = 'Geldig t/m: -';
    }
  }

  const ticketFill = $('#ticketFill');

  if (ticketFill) {
    ticketFill.style.width =
      Math.min(
        100,
        ((profile.rides || 0) / 12) * 100
      ) + '%';
  }

  renderLessons();
  renderMine();
}


/* =========================
   LESSEN TONEN
========================= */

async function renderLessons() {
  const box = $('#lessenContent');

  if (!box) return;

  const now = new Date();

// Bepaal de eerstvolgende maandag
const startOfWeek = new Date(now);
const day = now.getDay();

const daysUntilMonday = day === 0 ? 1 : 8 - day;

startOfWeek.setDate(now.getDate() + daysUntilMonday);
startOfWeek.setHours(0, 0, 0, 0);

// Zondag van die trainingsweek
const endOfWeek = new Date(startOfWeek);
endOfWeek.setDate(startOfWeek.getDate() + 6);
endOfWeek.setHours(23, 59, 59, 999);

// Alleen trainingen van die week
const displayLessons = lessons
  .filter(l => {
    const lessonStart = new Date(
      `${l.lesson_date}T${String(l.lesson_time).slice(0, 5)}:00`
    );

    return lessonStart >= startOfWeek && lessonStart <= endOfWeek;
  })
  .sort((a, b) => {
    const aTime = new Date(
      `${a.lesson_date}T${String(a.lesson_time).slice(0, 5)}:00`
    );

    const bTime = new Date(
      `${b.lesson_date}T${String(b.lesson_time).slice(0, 5)}:00`
    );

    return aTime - bTime;
  });

if (!displayLessons.length) {
  box.innerHTML = `
    <div class="card">
      <p>Er staan nog geen trainingen gepland.</p>
    </div>
  `;
  return;
}

  box.innerHTML = `
    <div class="card">

      <h2>Bootcamptrainingen deze week</h2>

      ${displayLessons.map(l => {
        const mine = myBookings.some(
          id => String(id) === String(l.id)
        );

        const waiting = myWaitlist.some(
          id => String(id) === String(l.id)
        );

        const trialsForLesson = trialLessons.filter(
          trial =>
            trial.trial_date === l.lesson_date &&
            String(trial.trial_time || '').slice(0, 5) ===
              String(l.lesson_time || '').slice(0, 5)
        );

        const normalCount = Number(l.booking_count || 0);
        const trialCount = trialsForLesson.length;
        const count = normalCount + trialCount;

        const maxParticipants =
          Number(l.max_participants || 0);

        const full =
          count >= maxParticipants;

        const lessonStarted =
          new Date(
            `${l.lesson_date}T${String(l.lesson_time).slice(0, 5)}:00`
          ) <= now;

        return `
          <div class="lesson">

            <div>

              <h3>
                ${esc(fmtDate(l.lesson_date))}
                •
                ${esc(String(l.lesson_time).slice(0, 5))}
              </h3>

              <div class="meta">
                📍 ${esc(l.location)}
                ·
                ${count}/${maxParticipants} deelnemers
              </div>

              <span class="badge ${
                mine
                  ? 'mine'
                  : full
                  ? 'full'
                  : ''
              }">
                ${
                  mine
                    ? 'Ingeschreven'
                    : waiting
                    ? 'Op reservelijst'
                    : full
                    ? 'Vol'
                    : 'Plek beschikbaar'
                }
              </span>

            </div>

            <button
              class="${
                lessonStarted
                  ? 'secondary'
                  : mine
                  ? 'secondary'
                  : 'primary'
              }"
              data-book="${l.id}"
              type="button"
              ${lessonStarted ? 'disabled' : ''}
            >
              ${
                lessonStarted
                  ? 'Gesloten'
                  : mine
                  ? 'Uitschrijven'
                  : waiting
                  ? 'Van reservelijst'
                  : full
                  ? 'Reserveplek'
                  : 'Inschrijven'
              }
            </button>

          </div>
        `;
      }).join('')}

    </div>
  `;

  $$('[data-book]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.book;

      const mine = myBookings.some(
        bookingId => String(bookingId) === String(id)
      );

      const waiting = myWaitlist.some(
        waitId => String(waitId) === String(id)
      );

      if (mine) {
        await toggleBooking(id);
        return;
      }

      if (waiting) {
        await toggleWaitlist(id);
        return;
      }

      const lesson = lessons.find(
        l => String(l.id) === String(id)
      );

      if (!lesson) {
        toast('Training niet gevonden');
        return;
      }

      const trialCount = trialLessons.filter(
        trial =>
          trial.trial_date === lesson.lesson_date &&
          String(trial.trial_time || '').slice(0, 5) ===
            String(lesson.lesson_time || '').slice(0, 5)
      ).length;

      const full =
        Number(lesson.booking_count || 0) + trialCount >=
        Number(lesson.max_participants || 0);

      if (full) {
        await toggleWaitlist(id);
      } else {
        await toggleBooking(id);
      }
    };
  });
}

/* =========================
   INSCHRIJVEN / UITSCHRIJVEN
========================= */

async function toggleBooking(id) {
  const mine = myBookings.some(
    bookingId => String(bookingId) === String(id)
  );

  const lesson = lessons.find(
    l => String(l.id) === String(id)
  );

  if (!lesson) {
    toast('Training niet gevonden');
    return;
  }

  if (
    !mine &&
    profile.credit_expires_at &&
    new Date(profile.credit_expires_at) < new Date()
  ) {
    toast('Je trainingstegoed is verlopen');
    return;
  }

  if (!mine && Number(profile.rides || 0) <= 0) {
    toast('Je hebt geen trainingstegoed meer');
    return;
  }

  const lessonStart = new Date(
    `${lesson.lesson_date}T${String(lesson.lesson_time).slice(0, 5)}:00`
  );

  const now = new Date();

  const dayBefore = new Date(lessonStart);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(21, 0, 0, 0);

  const sameDayStart = new Date(lessonStart);
  sameDayStart.setHours(16, 0, 0, 0);

  const day = lessonStart.getDay();

  const isWeekend =
    day === 0 ||
    day === 6;

  const isFridayMorning =
    day === 5 &&
    lessonStart.getHours() === 9;

  let cancellationCostsCredit = false;

  if (isWeekend || isFridayMorning) {
    cancellationCostsCredit = now >= dayBefore;
  } else {
    cancellationCostsCredit =
      now.toDateString() === lessonStart.toDateString() &&
      now > sameDayStart;
  }

  if (mine && cancellationCostsCredit) {
    const confirmed = confirm(
      'Let op: de kosteloze afmeldtijd is voorbij. ' +
      'Als je nu uitschrijft, ben je deze training en het gebruikte trainingstegoed kwijt. ' +
      'Weet je zeker dat je wilt uitschrijven?'
    );

    if (!confirmed) return;
  }

  const trialCount = trialLessons.filter(
    trial =>
      trial.trial_date === lesson.lesson_date &&
      String(trial.trial_time || '').slice(0, 5) ===
        String(lesson.lesson_time || '').slice(0, 5)
  ).length;

  const count =
    Number(lesson.booking_count || 0) +
    trialCount;

  const full =
    count >= Number(lesson.max_participants || 0);

  let action;

  if (mine) {
    action = 'cancel_booking';
  } else if (full) {
    action = 'join_waitlist';
  } else {
    action = 'book_lesson';
  }

  const { error } = await supabaseClient.rpc(
    action,
    {
      p_lesson_id: id
    }
  );

  if (error) {
    toast(error.message);
    return;
  }

 if (mine) {
  toast('Je bent uitgeschreven');
} else if (full) {
  toast('Je staat op de reservelijst');
} else {
  const remainingCredit = Number(profile.rides || 0) - 1;

  if (remainingCredit <= 0) {
    toast(`⚠️ Je bent ingeschreven voor ${fmtDate(lesson.lesson_date)} om ${String(lesson.lesson_time).slice(0, 5)} • ${lesson.location}. Dit was je laatste trainingstegoed.`);
  } else {
    toast(`✅ Je bent ingeschreven voor ${fmtDate(lesson.lesson_date)} om ${String(lesson.lesson_time).slice(0, 5)} • ${lesson.location}`);
  }
}

  await loadProfile();
  await loadData();

  render();
}


async function toggleWaitlist(id) {
  const waiting = myWaitlist.some(
    waitId => String(waitId) === String(id)
  );

  const { error } = await supabaseClient.rpc(
    waiting
      ? 'cancel_waitlist'
      : 'join_waitlist',
    {
      p_lesson_id: id
    }
  );

  if (error) {
    toast(error.message);
    return;
  }

  if (waiting) {
    toast('Van reservelijst verwijderd');
  } else {
    const { data: waitlistRows, error: waitlistError } =
      await supabaseClient
        .from('waitlist')
        .select('user_id, created_at')
        .eq('lesson_id', id)
        .order('created_at', { ascending: true });

    if (waitlistError) {
      toast('⏳ Je staat op de reservelijst');
    } else {
      const position =
        (waitlistRows || []).findIndex(
          row =>
            String(row.user_id) ===
            String(session.user.id)
        ) + 1;

      if (position > 0) {
        toast(`⏳ Je staat op reserveplek ${position}`);
      } else {
        toast('⏳ Je staat op de reservelijst');
      }
    }
  }

  await loadProfile();
  await loadData();

  render();
}


/* =========================
   MIJN TRAININGEN
========================= */

function renderMine() {
  const box = $('#mijn');

  if (!box) return;

  const mine = lessons.filter(
    l =>
      myBookings.some(
        id => String(id) === String(l.id)
      )
  );

  box.innerHTML = `
    <div class="card">

      <h2>Mijn trainingen</h2>

      ${
        mine.length
          ? mine.map(l => {
              const lessonStart = new Date(
                `${l.lesson_date}T${String(l.lesson_time).slice(0, 5)}:00`
              );

              const day = lessonStart.getDay();

              const isWeekend =
                day === 0 || day === 6;

              const isFridayMorning =
                day === 5 &&
                lessonStart.getHours() === 9;

              let cancelText = '';

if (isWeekend || isFridayMorning) {
  const deadline = new Date(lessonStart);

  deadline.setDate(deadline.getDate() - 1);

  const dayNames = [
    'zondag',
    'maandag',
    'dinsdag',
    'woensdag',
    'donderdag',
    'vrijdag',
    'zaterdag'
  ];

  cancelText =
    `🟢 Kosteloos afmelden tot ${dayNames[deadline.getDay()]} 21:00`;
} else {
  cancelText =
    '🟢 Kosteloos afmelden tot 16:00 op de trainingsdag';
}

              return `
                <div class="lesson">

                  <div>

                   <h3>
  ${
    l.lesson_date === new Date().toLocaleDateString('en-CA')
      ? '🔥 VANDAAG'
      : esc(fmtDate(l.lesson_date))
  }
  •
  ${esc(String(l.lesson_time).slice(0, 5))}
</h3>

                    <div class="meta">
                      📍 ${esc(l.location)}
                    </div>

                    <div class="meta">
                      ${cancelText}
                    </div>

                  </div>

                  <span class="badge mine">
                    Ingeschreven
                  </span>

                </div>
              `;
            }).join('')
          : `<p>Je bent nog niet ingeschreven voor een training.</p>`
      }

    </div>
  `;
}


/* =========================
   RITTENKAART AANVRAGEN
========================= */

async function requestRideCard(rides) {
  if (Number(rides) === 1) {
    window.location.href =
      'https://betaalverzoek.rabobank.nl/betaalverzoek/?id=pxnbV_fjTNi3UrUkhqZ0Yg';

    return;
  }

  const { error } = await supabaseClient
    .from('ride_requests')
    .insert({
      user_id: session.user.id,
      rides: Number(rides)
    });

  if (error) {
    toast(error.message);
    return;
  }

  const buyMsg = $('#buyMsg');

  if (buyMsg) {
    buyMsg.textContent =
      `Aanvraag voor ${rides} bootcamptrainingen tegoed is verzonden`;

    buyMsg.classList.remove('hidden');
  }
}


/* =========================
   BEHEER
========================= */

async function showAdmin() {
  if (!isAdmin) {
    toast('Geen beheerdersrechten');
    return;
  }

  $('#appView')?.classList.add('hidden');
  $('#adminView')?.classList.remove('hidden');

  await renderAdmin();
}


/* =========================
   TRAINING TOEVOEGEN
========================= */

async function addLesson() {
  const lesson_date = $('#lessonDate')?.value;
  const lesson_time = $('#lessonTime')?.value;
  const location = $('#lessonLocation')?.value.trim();
  const max_participants = Number($('#lessonMax')?.value);

  if (
    !lesson_date ||
    !lesson_time ||
    !location ||
    !max_participants
  ) {
    toast('Vul alle velden in');
    return;
  }

  const { error } = await supabaseClient
    .from('lessons')
    .insert({
      lesson_date,
      lesson_time,
      location,
      max_participants
    });

  if (error) {
    toast(error.message);
    return;
  }

  if ($('#lessonLocation')) {
    $('#lessonLocation').value = '';
  }

  toast('Training toegevoegd');

  await loadData();
  await renderAdmin();
}


async function addTrialLesson() {
  const name = $('#trialName')?.value.trim();
  const date = $('#trialDate')?.value;
  const time = $('#trialTime')?.value;

  if (!name || !date || !time) {
    toast('Vul naam, datum en tijd in');
    return;
  }

  const { error } = await supabaseClient
    .from('trial_lessons')
    .insert({
      name,
      trial_date: date,
      trial_time: time
    });

  if (error) {
    console.error(error);
    toast('Proefles toevoegen mislukt');
    return;
  }

  $('#trialName').value = '';
  $('#trialDate').value = '';
  $('#trialTime').value = '19:30';

  toast('Proefles toegevoegd');

  await loadData();
  await renderAdmin();

  render();
}


async function deleteTrialLesson(id) {
  if (!isAdmin) {
    toast('Geen toegang');
    return;
  }

  const confirmed = confirm(
    'Weet je zeker dat je deze proefles wilt verwijderen?'
  );

  if (!confirmed) return;

  const { error } = await supabaseClient
    .from('trial_lessons')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    toast('Proefles verwijderen mislukt');
    return;
  }

  toast('Proefles verwijderd');

  await loadData();
  await renderAdmin();

  render();
}


async function addWeekLessons() {
  const maxParticipants = Number($('#weekMax')?.value || 16);

  const checkedDays = [
    ...document.querySelectorAll('.weekEnabled:checked')
  ];

  if (checkedDays.length === 0) {
    toast('Kies minimaal één trainingsdag');
    return;
  }

  // Eerstvolgende maandag bepalen
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const dayNumber = today.getDay();

  const daysUntilMonday =
    dayNumber === 0
      ? 1
      : 8 - dayNumber;

  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);

  const newLessons = [];

  for (const checkbox of checkedDays) {
    const targetDay = Number(checkbox.dataset.day);
    const slot = checkbox.dataset.slot || '1';

    const timeInput = document.querySelector(
      `.weekTime[data-day="${targetDay}"][data-slot="${slot}"]`
    );

    if (!timeInput || !timeInput.value) {
      continue;
    }

    const lessonTime = timeInput.value;

    // Maandag = 1 ... zaterdag = 6, zondag = 0
    const offset =
      targetDay === 0
        ? 6
        : targetDay - 1;

    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);

    const lessonDate =
      `${date.getFullYear()}-` +
      `${String(date.getMonth() + 1).padStart(2, '0')}-` +
      `${String(date.getDate()).padStart(2, '0')}`;

    const location =
      checkbox.dataset.location ||
      $('#weekLocation')?.value?.trim() ||
      'Station De Vink';

    // Alleen dezelfde DATUM + TIJD geldt als dezelfde training
    const exists = lessons.some(lesson =>
      String(lesson.lesson_date) === lessonDate &&
      String(lesson.lesson_time).slice(0, 5) ===
        String(lessonTime).slice(0, 5)
    );

    if (exists) {
      continue;
    }

    // Voorkom dubbel binnen dezelfde klik
    const alreadyAdded = newLessons.some(lesson =>
      lesson.lesson_date === lessonDate &&
      String(lesson.lesson_time).slice(0, 5) ===
        String(lessonTime).slice(0, 5)
    );

    if (alreadyAdded) {
      continue;
    }

    newLessons.push({
      lesson_date: lessonDate,
      lesson_time: lessonTime,
      location: location,
      max_participants: maxParticipants
    });
  }

  if (newLessons.length === 0) {
    toast('Deze trainingen staan al ingepland voor de komende week');
    return;
  }

  const { error } = await supabaseClient
    .from('lessons')
    .insert(newLessons);

  if (error) {
    console.error('Weekplanning fout:', error);
    toast(`Fout bij klaarzetten: ${error.message}`);
    return;
  }

  toast(`${newLessons.length} trainingen succesvol toegevoegd`);

  document
    .querySelectorAll('.weekEnabled')
    .forEach(checkbox => {
      checkbox.checked = false;
    });

  await loadData();
  await renderAdmin();
  render();
}

/* =========================
   BEHEER TONEN
========================= */

/*
 * Training annuleren vanuit beheer.
 *
 * - Geeft trainingstegoed terug aan aangemelde klanten
 * - Verwijdert de reservelijst
 * - Verwijdert de inschrijvingen
 * - Verwijdert daarna de training
 */
async function cancelLesson(id) {
  if (!isAdmin) {
    toast('Geen toegang');
    return;
  }

  const lesson = lessons.find(
    l => String(l.id) === String(id)
  );

  if (!lesson) {
    toast('Training niet gevonden');
    return;
  }

  const confirmed = confirm(
    `Weet je zeker dat je deze training wilt annuleren?\n\n` +
    `${fmtDate(lesson.lesson_date)} • ` +
    `${String(lesson.lesson_time).slice(0, 5)}\n\n` +
    `Aangemelde klanten krijgen hun trainingstegoed terug.`
  );

  if (!confirmed) {
    return;
  }

  try {

    /* =========================
       INSCHRIJVINGEN OPHALEN
    ========================= */

    const {
      data: lessonBookings,
      error: bookingsError
    } = await supabaseClient
      .from('bookings')
      .select('user_id')
      .eq('lesson_id', id);

    if (bookingsError) {
      console.error(bookingsError);
      toast('Inschrijvingen ophalen mislukt');
      return;
    }


    /* =========================
       TEGOED TERUGGEVEN
    ========================= */

    for (const booking of (lessonBookings || [])) {

      const {
        data: customer,
        error: customerError
      } = await supabaseClient
        .from('profiles')
        .select('credits')
        .eq('id', booking.user_id)
        .single();

      if (customerError) {
        console.error(customerError);
        toast(
          'Training niet geannuleerd: tegoed teruggeven mislukt'
        );
        return;
      }

      const currentCredits =
        Number(customer?.credits || 0);

      const { error: creditError } =
        await supabaseClient
          .from('profiles')
          .update({
            credits: currentCredits + 1
          })
          .eq('id', booking.user_id);

      if (creditError) {
        console.error(creditError);
        toast(
          'Training niet geannuleerd: tegoed teruggeven mislukt'
        );
        return;
      }
    }


    /* =========================
       RESERVELIJST VERWIJDEREN
    ========================= */

    const { error: waitlistError } =
      await supabaseClient
        .from('waitlist')
        .delete()
        .eq('lesson_id', id);

    if (waitlistError) {
      console.error(waitlistError);
      toast('Reservelijst verwijderen mislukt');
      return;
    }


    /* =========================
       INSCHRIJVINGEN VERWIJDEREN
    ========================= */

    const { error: deleteBookingsError } =
      await supabaseClient
        .from('bookings')
        .delete()
        .eq('lesson_id', id);

    if (deleteBookingsError) {
      console.error(deleteBookingsError);
      toast('Inschrijvingen verwijderen mislukt');
      return;
    }


    /* =========================
       TRAINING VERWIJDEREN
    ========================= */

    const { error: lessonError } =
      await supabaseClient
        .from('lessons')
        .delete()
        .eq('id', id);

    if (lessonError) {
      console.error(lessonError);
      toast('Training verwijderen mislukt');
      return;
    }


    /* =========================
       KLAAR
    ========================= */

    toast('Training geannuleerd');

    await loadData();
    await renderAdmin();

    render();

  } catch (error) {
    console.error(error);
    toast('Annuleren van training mislukt');
  }
}


/* =========================
   BEHEER WEERGEVEN
========================= */


async function renderAdmin() {
  const trialBox = $('#trialLessons');

  if (trialBox) {
    if (trialLessons.length > 0) {
      trialBox.innerHTML = `
        <div style="margin-top:16px;">

          <strong>Geplande proeflessen</strong>

          ${trialLessons.map(trial => `
            <div class="lesson">

              <div>

                <strong>${esc(trial.name)}</strong>

                <div class="meta">
                  📅 ${esc(fmtDate(trial.trial_date))}
                  ·
                  ⏰ ${esc(String(trial.trial_time || '').slice(0, 5))}
                </div>

              </div>

              <button
                class="danger"
                type="button"
                data-delete-trial="${trial.id}"
              >
                Verwijderen
              </button>

            </div>
          `).join('')}

        </div>
      `;
    } else {
      trialBox.innerHTML = `
        <p class="meta" style="margin-top:16px;">
          Geen proeflessen gepland.
        </p>
      `;
    }
  }

  const {
    data: members,
    error: memberError
  } = await supabaseClient
    .from('profiles')
    .select('id,name,email,rides,credit_expires_at')
    .order('name');

  if (memberError) {
    console.error(memberError);
  }

  const membersById = Object.fromEntries(
    (members || []).map(member => [
      String(member.id),
      member
    ])
  );

  const {
    data: bookings,
    error: bookingError
  } = await supabaseClient
    .from('bookings')
    .select('lesson_id,user_id');

  if (bookingError) {
    console.error(bookingError);
  }

  const adminCustomers = $('#adminCustomers');

  if (adminCustomers) {
    adminCustomers.innerHTML =
      members?.length
        ? `
          <table class="table">

            <thead>
              <tr>
                <th>Naam</th>
                <th>E-mail</th>
                <th>Training tegoed</th>
                <th>Geldig t/m</th>
                <th>Actie</th>
              </tr>
            </thead>

            <tbody>

              ${members.map(m => `
                <tr>

                  <td>
                    ${esc(m.name)}
                  </td>

                  <td>
                    ${esc(m.email)}
                  </td>

                  <td>
                    <strong>
                      ${Number(m.rides || 0)}
                    </strong>
                  </td>

                  <td>
                    ${
                      m.credit_expires_at &&
                      Number(m.rides || 0) > 0
                        ? new Date(
                            m.credit_expires_at
                          ).toLocaleDateString(
                            'nl-NL',
                            {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            }
                          )
                        : '-'
                    }
                  </td>

                  <td>

                    <button
                      class="secondary"
                      data-credit-minus="${m.id}"
                      type="button"
                    >
                      -1
                    </button>

                    <button
                      class="primary"
                      data-credit-plus="${m.id}"
                      type="button"
                    >
                      +1
                    </button>

                    <br>

                    <button
                      class="primary"
                      data-credit-add="${m.id}"
                      data-amount="1"
                      type="button"
                    >
                      1 losse les
                    </button>

                    <button
                      class="primary"
                      data-credit-add="${m.id}"
                      data-amount="5"
                      type="button"
                    >
                      5 lessen
                    </button>

                    <button
                      class="primary"
                      data-credit-add="${m.id}"
                      data-amount="12"
                      type="button"
                    >
                      12 lessen
                    </button>

                    <button
                      class="danger"
                      data-delete-customer="${m.id}"
                      type="button"
                    >
                      Verwijderen
                    </button>

                  </td>

                </tr>
              `).join('')}

            </tbody>

          </table>
        `
        : '<p>Nog geen deelnemers.</p>';
  }

  const adminLessons = $('#adminLessons');

  if (adminLessons) {
    if (lessons.length) {
      const lessonItems = await Promise.all(
        lessons.map(async l => {
          const bs = (bookings || []).filter(
            b =>
              String(b.lesson_id) ===
              String(l.id)
          );

          const attendees = bs.map(booking => {
            const member =
              membersById[String(booking.user_id)];

            return member
              ? member.name || member.email
              : 'Onbekende deelnemer';
          });

          const trialAttendees = (trialLessons || [])
            .filter(
              trial =>
                trial.trial_date === l.lesson_date &&
                String(trial.trial_time || '').slice(0, 5) ===
                  String(l.lesson_time || '').slice(0, 5)
            )
            .map(trial => trial.name);

          attendees.push(...trialAttendees);

          const {
            data: waitlistData,
            error: waitlistError
          } = await supabaseClient
            .from('waitlist')
            .select('id')
            .eq('lesson_id', l.id);

          if (waitlistError) {
            console.error(waitlistError);
          }

          const ws = waitlistData || [];

          const trialCount = trialAttendees.length;

          return `
            <div class="lesson">

              <div>

                <h3>
                  ${esc(fmtDate(l.lesson_date))}
                  •
                  ${esc(String(l.lesson_time).slice(0, 5))}
                </h3>

                <div class="meta">

                  📍 ${esc(l.location)}

                  ·

                  ${bs.length + trialCount}/${l.max_participants} deelnemers

                  · ${ws.length} reserve

                  ${
                    attendees.length
                      ? `
                        <div class="meta">
                          <strong>Aangemeld:</strong>
                          <br>
                          ${attendees
                            .map(name => `• ${esc(name)}`)
                            .join('<br>')}
                        </div>
                      `
                      : `
                        <div class="meta">
                          <strong>Aangemeld:</strong> niemand
                        </div>
                      `
                  }
<div style="margin-top:12px;">
  <button
    type="button"
    class="danger"
    onclick="cancelLesson('${l.id}')"
  >
    Training annuleren
  </button>
</div>


                </div>

              </div>

            </div>
          `;
        })
      );

      adminLessons.innerHTML = lessonItems.join('');
    } else {
      adminLessons.innerHTML =
        '<p>Nog geen trainingen.</p>';
    }
  }
}


/* =========================
   KLANT ZOEKEN
========================= */

const customerSearch = $('#customerSearch');

if (customerSearch) {
  customerSearch.oninput = () => {
    const zoekterm =
      customerSearch.value.trim().toLowerCase();

    $$('#adminCustomers tbody tr').forEach(row => {
      const naam =
        row.children[0]?.textContent.toLowerCase() || '';

      const email =
        row.children[1]?.textContent.toLowerCase() || '';

      const achternaam =
        naam.trim().split(/\s+/).slice(-1)[0] || '';

      row.style.display =
        achternaam.includes(zoekterm) ||
        email.includes(zoekterm)
          ? ''
          : 'none';
    });
  };
}


/* =========================
   MEDEDELING
========================= */

async function saveAnnouncement() {
  if (!isAdmin) {
    toast('Geen toegang');
    return;
  }

  const title =
    $('#adminAnnouncementTitle')?.value.trim();

  const message =
    $('#adminAnnouncementMessage')?.value.trim();

  const startsAt =
    $('#adminAnnouncementStarts')?.value ||
    new Date().toISOString().slice(0, 10);

  const endsAt =
    $('#adminAnnouncementEnds')?.value ||
    null;

  const active =
    !!$('#adminAnnouncementActive')?.checked;

  if (!title || !message) {
    toast('Vul titel en bericht in');
    return;
  }

  const {
    error: deactivateError
  } = await supabaseClient
    .from('announcements')
    .update({
      active: false
    })
    .eq('active', true);

  if (deactivateError) {
    console.error(deactivateError);
    toast(deactivateError.message);
    return;
  }

  const { error } = await supabaseClient
    .from('announcements')
    .insert({
      title,
      message,
      starts_at: startsAt,
      ends_at: endsAt,
      active
    });

  if (error) {
    console.error(error);
    toast(error.message);
    return;
  }

  toast('Mededeling opgeslagen');

  await loadData();

  render();
}


async function deleteAnnouncement() {
  if (!isAdmin) {
    toast('Geen toegang');
    return;
  }

  const confirmed = confirm(
    'Weet je zeker dat je de mededeling wilt verwijderen?'
  );

  if (!confirmed) return;

  const { error } = await supabaseClient
    .from('announcements')
    .update({
      active: false
    })
    .eq('active', true);

  if (error) {
    console.error(error);
    toast('Mededeling verwijderen mislukt');
    return;
  }

  if ($('#adminAnnouncementTitle')) {
    $('#adminAnnouncementTitle').value = '';
  }

  if ($('#adminAnnouncementMessage')) {
    $('#adminAnnouncementMessage').value = '';
  }

  if ($('#adminAnnouncementStarts')) {
    $('#adminAnnouncementStarts').value = '';
  }

  if ($('#adminAnnouncementEnds')) {
    $('#adminAnnouncementEnds').value = '';
  }

  if ($('#adminAnnouncementActive')) {
    $('#adminAnnouncementActive').checked = false;
  }

  toast('Mededeling verwijderd');

  await loadData();

  render();
}


/* =========================
   TRAINING TEGOED
========================= */

async function changeCredit(userId, amount) {
  const {
    data: customerProfile,
    error
  } = await supabaseClient
    .from('profiles')
    .select('rides')
    .eq('id', userId)
    .single();

  if (error) {
    console.error(error);
    toast('Training tegoed aanpassen mislukt');
    return;
  }

  const newRides = Math.max(
    0,
    Number(customerProfile.rides || 0) + amount
  );

  const updateData = {
    rides: newRides
  };

  if (amount > 0) {
    const expiry = new Date();

    expiry.setFullYear(
      expiry.getFullYear() + 1
    );

    updateData.credit_expires_at =
      expiry.toISOString();
  }

  const {
    error: updateError
  } = await supabaseClient
    .from('profiles')
    .update(updateData)
    .eq('id', userId);

  if (updateError) {
    console.error(updateError);
    toast('Training tegoed aanpassen mislukt');
    return;
  }

  toast('Training tegoed aangepast');

  if (
    session?.user?.id === userId
  ) {
    await loadProfile();
    render();
  }

  await renderAdmin();
}


/* =========================
   KLANT VERWIJDEREN
========================= */

document.addEventListener(
  'click',
  async e => {
    const btn = e.target.closest(
      '[data-delete-customer]'
    );

    if (!btn) return;

    const customerId =
      btn.dataset.deleteCustomer;

    if (!isAdmin) {
      toast(
        'Alleen de beheerder kan klanten verwijderen'
      );
      return;
    }

    if (
      customerId ===
      session?.user?.id
    ) {
      toast(
        'Je kunt je eigen beheerdersaccount niet verwijderen'
      );
      return;
    }

    const zeker = window.confirm(
      'Weet je zeker dat je deze klant volledig wilt verwijderen?\n\n' +
      'Het account, trainingstegoed, inschrijvingen en reserveplekken worden definitief verwijderd.'
    );

    if (!zeker) return;

    const oudeTekst = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Verwijderen...';

    const { error } = await supabaseClient.rpc(
      'admin_delete_customer',
      {
        p_user_id: customerId
      }
    );

    if (error) {
      console.error(
        'Klant verwijderen mislukt:',
        error
      );

      toast(
        'Verwijderen mislukt: ' +
        error.message
      );

      btn.disabled = false;
      btn.textContent = oudeTekst;

      return;
    }

    const rij = btn.closest('tr');

    if (rij) {
      rij.remove();
    }

    toast('Klant volledig verwijderd');
  }
);


/* =========================
   KNOPPEN
========================= */

const signUpBtn = $('#signUpBtn');
const nameInput = $('#nameInput');
const emailInput = $('#emailInput');
const signUpPasswordInput = $('#passwordInput');

function updateSignUpButton() {
  if (!signUpBtn) return;

  const complete =
    nameInput?.value.trim().length > 0 &&
    emailInput?.value.trim().length > 0 &&
    signUpPasswordInput?.value.length >= 6;

  if (complete) {
    signUpBtn.classList.remove('secondary');
    signUpBtn.classList.remove('primary');
    signUpBtn.style.background = '#28a745';
    signUpBtn.style.color = '#ffffff';
  } else {
    signUpBtn.classList.remove('primary');
    signUpBtn.classList.add('secondary');
    signUpBtn.style.background = '';
    signUpBtn.style.color = '';
  }
}

if (signUpBtn) {
  signUpBtn.onclick = signUp;

  [nameInput, emailInput, signUpPasswordInput].forEach(input => {
    if (input) {
      input.addEventListener('input', updateSignUpButton);
    }
  });

  updateSignUpButton();
}

const loginBtn = $('#loginBtn');

if (loginBtn) {
  loginBtn.onclick = signIn;
}

const togglePasswordBtn = $('#togglePassword');
const passwordInput = $('#passwordInput');

if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.onclick = () => {
    const isHidden = passwordInput.type === 'password';

    passwordInput.type = isHidden ? 'text' : 'password';

    // Verborgen = aapje, zichtbaar = oogje
    togglePasswordBtn.textContent = isHidden ? '👁️' : '🙈';
    togglePasswordBtn.setAttribute(
      'aria-label',
      isHidden ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'
    );
  };
}

const forgotPasswordBtn = $('#forgotPasswordBtn');

if (forgotPasswordBtn) {
  forgotPasswordBtn.onclick = forgotPassword;
}

const accountHelpBtn = $('#accountHelpBtn');
const accountHelp = $('#accountHelp');

if (accountHelpBtn && accountHelp) {
  accountHelpBtn.onclick = () => {
    accountHelp.classList.toggle('hidden');

    accountHelpBtn.textContent =
      accountHelp.classList.contains('hidden')
        ? '📖 Bekijk uitleg account aanmaken'
        : '📖 Verberg uitleg account aanmaken';
  };
}

const saveNewPasswordBtn = $('#saveNewPasswordBtn');

if (saveNewPasswordBtn) {
  saveNewPasswordBtn.onclick = saveNewPassword;
}

const logoutBtn = $('#logoutBtn');

if (logoutBtn) {
  logoutBtn.onclick = signOut;
}

const adminTabBtn = $('#adminTabBtn');

if (adminTabBtn) {
  adminTabBtn.onclick = showAdmin;
}

const adminLogout = $('#adminLogout');

if (adminLogout) {
  adminLogout.onclick = showApp;
}

const saveAnnouncementBtn = $('#saveAnnouncementBtn');

if (saveAnnouncementBtn) {
  saveAnnouncementBtn.onclick = saveAnnouncement;
}

const deleteAnnouncementBtn = $('#deleteAnnouncementBtn');

if (deleteAnnouncementBtn) {
  deleteAnnouncementBtn.onclick = deleteAnnouncement;
}

const addLessonBtn = $('#addLesson');

if (addLessonBtn) {
  addLessonBtn.onclick = addLesson;
}

const addWeekLessonsBtn = $('#addWeekLessons');

if (addWeekLessonsBtn) {
  addWeekLessonsBtn.onclick = addWeekLessons;
}

const addTrialLessonBtn = $('#addTrialLesson');

if (addTrialLessonBtn) {
  addTrialLessonBtn.onclick = addTrialLesson;
}


const trialLessonsBox = $('#trialLessons');

if (trialLessonsBox) {
  trialLessonsBox.onclick = async e => {
    const deleteBtn = e.target.closest(
      '[data-delete-trial]'
    );

    if (!deleteBtn) return;

    await deleteTrialLesson(
      deleteBtn.dataset.deleteTrial
    );
  };
}


const adminCustomersBox = $('#adminCustomers');

if (adminCustomersBox) {
  adminCustomersBox.onclick = async e => {
    const minusBtn = e.target.closest(
      '[data-credit-minus]'
    );

    const plusBtn = e.target.closest(
      '[data-credit-plus]'
    );

    const addBtn = e.target.closest(
      '[data-credit-add]'
    );

    if (minusBtn) {
      await changeCredit(
        minusBtn.dataset.creditMinus,
        -1
      );
      return;
    }

    if (addBtn) {
      const amount = Number(
        addBtn.dataset.amount || 0
      );

      if (amount > 0) {
        await changeCredit(
          addBtn.dataset.creditAdd,
          amount
        );
      }

      return;
    }

    if (plusBtn) {
      await changeCredit(
        plusBtn.dataset.creditPlus,
        1
      );
    }
  };
}


/* =========================
   TABBLADEN
========================= */

$$('.tab[data-tab]').forEach(btn => {
  btn.onclick = () => {
    $$('.tab').forEach(b => {
      b.classList.remove('active');
    });

    btn.classList.add('active');

    $$('.panel').forEach(p => {
      p.classList.add('hidden');
    });

    const panel = $('#' + btn.dataset.tab);

    if (panel) {
      panel.classList.remove('hidden');
    }
  };
});


/* =========================
   RITTENKAART KNOPPEN
========================= */

$$('.buy').forEach(btn => {
  btn.onclick = async () => {
    const rides = Number(btn.dataset.rides);

    await requestRideCard(rides);

    if (rides === 5) {
      window.location.href =
        'https://betaalverzoek.rabobank.nl/betaalverzoek/?id=TJssJBxBTbGjXTnYr7Tvnw';
    }

    if (rides === 12) {
      window.location.href =
        'https://betaalverzoek.rabobank.nl/betaalverzoek/?id=9EANg5D3QCCgbQpY73u2Tw';
    }
  };
});


/* =========================
   SUPABASE LOGIN STATUS
========================= */

supabaseClient.auth.onAuthStateChange(
  async (
    event,
    newSession
  ) => {
    if (
      event ===
      'PASSWORD_RECOVERY'
    ) {
      session = newSession;

      $('#loginView')?.classList.add('hidden');
      $('#appView')?.classList.add('hidden');
      $('#adminView')?.classList.add('hidden');
      $('#logoutBtn')?.classList.add('hidden');
      $('#resetPasswordView')?.classList.remove('hidden');

      return;
    }

    session = newSession;

    if (session) {
      await loadProfile();
      await loadData();

      showApp();
    } else {
      showLogin();
    }
  }
);


/* =========================
   PUSH / SERVICE WORKER
========================= */

function urlBase64ToUint8Array(base64String) {
  const padding =
    '='.repeat(
      (4 - (base64String.length % 4)) % 4
    );

  const base64 =
    (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

  const rawData = atob(base64);

  return Uint8Array.from(
    [...rawData].map(
      char => char.charCodeAt(0)
    )
  );
}


async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    let reloading = false;

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (reloading) return;

        reloading = true;
        window.location.reload();
      }
    );

    const registration =
      await navigator.serviceWorker.register(
        './sw.js',
        {
          updateViaCache: 'none'
        }
      );

    // Bij iedere start direct controleren
    // of er een nieuwe service worker is.
    await registration.update();

    // Ook opnieuw controleren wanneer
    // de app weer naar de voorgrond komt.
    document.addEventListener(
      'visibilitychange',
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          registration.update().catch(error => {
            console.error(
              'Service worker update mislukt:',
              error
            );
          });
        }
      }
    );

    return registration;

  } catch (error) {
    console.error(
      'Service worker registreren mislukt:',
      error
    );

    return null;
  }
}


/* =========================
   PUSHMELDINGEN
========================= */

async function enableNotifications() {
  if (!session?.user) {
    toast(
      'Log eerst in om meldingen aan te zetten'
    );
    return;
  }

  if (
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    toast(
      'Pushmeldingen worden op dit apparaat niet ondersteund'
    );
    return;
  }

  try {
    const permission =
      await Notification.requestPermission();

    if (permission !== 'granted') {
      toast(
        'Meldingen zijn niet toegestaan'
      );
      return;
    }

    let registration =
      await navigator.serviceWorker.getRegistration();

    if (!registration) {
      registration =
        await registerServiceWorker();
    }

    if (!registration) {
      throw new Error(
        'Service worker kon niet worden gestart'
      );
    }

    await navigator.serviceWorker.ready;

    let subscription =
      await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
    }

    subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          urlBase64ToUint8Array(
            VAPID_PUBLIC_KEY
          )
      });

    const subscriptionData =
      subscription.toJSON();

    if (
      !subscription.endpoint ||
      !subscriptionData.keys?.p256dh ||
      !subscriptionData.keys?.auth
    ) {
      throw new Error(
        'Push-abonnement is niet compleet'
      );
    }

    const { error } =
      await supabaseClient
        .from('push_subscriptions')
        .upsert(
          {
            user_id:
              session.user.id,

            endpoint:
              subscription.endpoint,

            p256dh:
              subscriptionData.keys.p256dh,

            auth:
              subscriptionData.keys.auth
          },
          {
            onConflict: 'endpoint'
          }
        );

    if (error) {
      throw error;
    }

    toast('Meldingen staan aan ✅');

  } catch (error) {
    console.error(
      'Meldingen aanzetten mislukt:',
      error
    );

    toast(
      `Mislukt: ${
        error?.message ||
        'onbekende fout'
      }`
    );
  }
}


const enableNotificationsBtn =
  $('#enableNotificationsBtn');

if (enableNotificationsBtn) {
  enableNotificationsBtn.onclick =
    enableNotifications;
}


/* =========================
   START APP
========================= */

async function startApp() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.location.reload();
      }
    );
  }

  await registerServiceWorker();
  await refreshSession();
}

startApp();
