const SUPABASE_URL = 'https://zjvqbfmxaibjcdpttgmj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oZIVgG4DUG8zo6C1hoPkJA_x4YbnKkA';

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
  t.textContent = msg;
  t.classList.remove('hidden');

  setTimeout(() => {
    t.classList.add('hidden');
  }, 2200);
};

let session = null;
let profile = null;
let lessons = [];
let myBookings = [];
let isAdmin = false;
let myWaitlist = [];

/* =========================
   PROFIEL
========================= */

async function loadProfile() {

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id,name,email,rides,is_admin')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error(error);
    toast('Profiel kon niet worden geladen');
    return;
  }

  profile = data;
  isAdmin = !!data.is_admin;
}


/* =========================
   LESSEN + INSCHRIJVINGEN
========================= */

async function loadData() {

  const {
    data: lessonData,
    error: lessonError
  } = await supabaseClient.rpc(
    'get_lessons_with_counts'
  );

  if (lessonError) {
    console.error(lessonError);
    lessons = [];
  } else {
    lessons = lessonData || [];
  }

  const {
    data: bookingData,
    error: bookingError
  } = await supabaseClient
    .from('bookings')
    .select('lesson_id')
    .eq('user_id', session.user.id);

  if (bookingError) {
    console.error(bookingError);
    myBookings = [];
  } else {
    myBookings = (bookingData || [])
      .map(x => x.lesson_id);
  }

  const {
    data: waitlistData,
    error: waitlistError
  } = await supabaseClient
    .from('waitlist')
    .select('lesson_id')
    .eq('user_id', session.user.id);

  if (waitlistError) {
    console.error(waitlistError);
    myWaitlist = [];
  } else {
    myWaitlist = (waitlistData || [])
      .map(x => x.lesson_id);
  }
  // Mededeling ophalen
const today = new Date().toISOString().slice(0, 10);

const { data: announcements, error: announcementError } =
  await supabaseClient
    .from('announcements')
    .select('title, message, starts_at, ends_at, active, created_at')
    .eq('active', true)
    .lte('starts_at', today)
    .or(`ends_at.is.null,ends_at.gte.${today}`)
    .order('created_at', { ascending: false })
    .limit(1);

const announcementBox = $('#announcementBox');

if (announcementError) {
  console.error('Mededeling ophalen mislukt:', announcementError);
  announcementBox.classList.add('hidden');
} else if (announcements && announcements.length > 0) {
  $('#announcementTitle').textContent = announcements[0].title;
  $('#announcementMessage').textContent = announcements[0].message;
  announcementBox.classList.remove('hidden');
} else {
  announcementBox.classList.add('hidden');
}
}
/* =========================
   SCHERMEN
========================= */

function showLogin() {

  $('#loginView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  $('#adminView').classList.add('hidden');
  $('#logoutBtn').classList.add('hidden');
}


function showApp() {

  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#adminView').classList.add('hidden');
  $('#logoutBtn').classList.remove('hidden');

  const adminButton = $('#adminTabBtn');

  if (adminButton) {
    adminButton.classList.toggle(
      'hidden',
      !isAdmin
    );
  }

  render();
}


async function refreshSession() {

  const { data } =
    await supabaseClient.auth.getSession();

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

  const name =
    $('#nameInput').value.trim();

  const email =
    $('#emailInput')
      .value
      .trim()
      .toLowerCase();

  const password =
    $('#passwordInput').value;

  if (
    !name ||
    !email ||
    password.length < 6
  ) {
    toast(
      'Vul naam, e-mail en minimaal 6 tekens wachtwoord in'
    );
    return;
  }

  const { data, error } =
    await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name
        }
      }
    });

  if (error) {
    toast(error.message);
    return;
  }

  if (!data.session) {

    $('#authMsg').textContent =
      'Account aangemaakt. Controleer je e-mail en log daarna in.';

    $('#authMsg')
      .classList
      .remove('hidden');

  } else {

    await refreshSession();
  }
}


/* =========================
   INLOGGEN
========================= */

async function signIn() {

  const email =
    $('#emailInput')
      .value
      .trim()
      .toLowerCase();

  const password =
    $('#passwordInput').value;

  if (!email || !password) {

    toast(
      'Vul e-mail en wachtwoord in'
    );

    return;
  }

  const { error } =
    await supabaseClient
      .auth
      .signInWithPassword({
        email,
        password
      });

  if (error) {

    toast(
      'Inloggen mislukt: ' +
      error.message
    );

    return;
  }

  await refreshSession();
}


/* =========================
   UITLOGGEN
========================= */

async function signOut() {

  await supabaseClient
    .auth
    .signOut();

  showLogin();
}


/* =========================
   APP TONEN
========================= */

function render() {

  if (!profile) return;

  $('#welcomeName').textContent =
    'Hoi ' +
    (profile.name || 'sportieveling')
      .split(' ')[0] +
    '!';

  $('#ridesCount').textContent =
    profile.rides || 0;

 $('#ticketCount').textContent =
  (profile.rides || 0) +
  ' training' +
  (profile.rides === 1
    ? ''
    : 'en'); 

  $('#ticketFill').style.width =
    Math.min(
      100,
      ((profile.rides || 0) / 12) * 100
    ) + '%';

  renderLessons();
  renderMine();
}


/* =========================
   LESSEN TONEN
========================= */

async function renderLessons() {

  const box = $('#lessen');
const upcomingLessons = lessons
  .filter(l => {
    const dateTime = new Date(
      `${l.lesson_date}T${String(l.lesson_time).slice(0, 5)}`
    );
    return dateTime > new Date();
  })
  .sort((a, b) => {
    const aTime = new Date(
      `${a.lesson_date}T${String(a.lesson_time).slice(0, 5)}`
    );
    const bTime = new Date(
      `${b.lesson_date}T${String(b.lesson_time).slice(0, 5)}`
    );
    return aTime - bTime;
  });
  if (!upcomingLessons.length) {

    box.innerHTML =
      '<div class="card">' +
      '<p>Er staan nog geen trainingen gepland.</p>' +
      '</div>';

    return;
  }

  box.innerHTML =
    '<div class="card">' +
    '<h2>Eerstvolgende bootcamptraining</h2>' +

    upcomingLessons.slice(0, 1).map(l => {

      const mine =
        myBookings.includes(l.id);
const waiting =
  myWaitlist.includes(l.id);
      const count =
        Number(l.booking_count || 0);

      const full =
        count >=
        Number(l.max_participants);

      return `
        <div class="lesson">

          <div>

            <h3>
              ${esc(fmtDate(l.lesson_date))}
              •
              ${esc(
                String(l.lesson_time)
                  .slice(0, 5)
              )}
            </h3>

            <div class="meta">
              📍 ${esc(l.location)}
              ·
              ${count}/${l.max_participants}
              deelnemers
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
  class="${mine ? 'secondary' : 'primary'}"
  data-book="${l.id}"
>
${
  mine
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

    }).join('') +

    '</div>';


$$('[data-book]').forEach(button => {
  button.onclick = () => {
    const id = button.dataset.book;

    if (myBookings.includes(id)) {
      toggleBooking(id);
    } else if (myWaitlist.includes(id)) {
      toggleWaitlist(id);
    } else {
      const lesson = lessons.find(l => l.id === id);

      const full =
        Number(lesson?.booking_count || 0) >=
        Number(lesson?.max_participants || 0);

      if (full) {
        toggleWaitlist(id);
      } else {
        toggleBooking(id);
      }
    }
  };
});
}


/* =========================
   INSCHRIJVEN / UITSCHRIJVEN
========================= */

async function toggleBooking(id) {

  const mine =
    myBookings.includes(id);

  const lesson =
    lessons.find(l => l.id === id);

  if (!lesson) {
    toast('Training niet gevonden');
    return;
  }

  const count =
    Number(lesson.booking_count || 0);

  const full =
    count >= Number(lesson.max_participants);


  let action;

  if (mine) {
    action = 'cancel_booking';
  } else if (full) {
    action = 'join_waitlist';
  } else {
    action = 'book_lesson';
  }


  const { error } =
    await supabaseClient.rpc(
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
    toast('Je bent ingeschreven! 1 training tegoed afgeschreven');
  }


  await loadProfile();
  await loadData();
  render();
}
async function toggleWaitlist(id) {
  const waiting = myWaitlist.includes(id);

  const { error } = await supabaseClient.rpc(
    waiting ? 'cancel_waitlist' : 'join_waitlist',
    {
      p_lesson_id: id
    }
  );

  if (error) {
    toast(error.message);
    return;
  }

  toast(
    waiting
      ? 'Van reservelijst verwijderd'
      : 'Je staat op de reservelijst'
  );

  await loadProfile();
  await loadData();
  render();
}

/* =========================
   MIJN TRAININGEN
========================= */

function renderMine() {

  const mine =
    lessons.filter(
      l =>
        myBookings.includes(l.id)
    );

  $('#mijn').innerHTML = `

    <div class="card">

      <h2>Mijn trainingen</h2>

      ${
        mine.length

          ? mine.map(l => `

            <div class="lesson">

              <div>

                <h3>
                  ${esc(
                    fmtDate(
                      l.lesson_date
                    )
                  )}
                  •
                  ${esc(
                    String(
                      l.lesson_time
                    ).slice(0, 5)
                  )}
                </h3>

                <div class="meta">
                  📍 ${esc(l.location)}
                </div>

              </div>

              <span class="badge mine">
                Ingeschreven
              </span>

            </div>

          `).join('')

          : '<p>Je bent nog niet ingeschreven voor een training.</p>'
      }

    </div>
  `;
}


/* =========================
   RITTENKAART AANVRAGEN
========================= */

async function requestRideCard(
  rides
) {

  const { error } =
    await supabaseClient
      .from('ride_requests')
      .insert({

        user_id:
          session.user.id,

        rides:
          Number(rides)

      });

  if (error) {

    toast(error.message);
    return;
  }
$('#buyMsg').textContent =
`Aanvraag voor ${rides} bootcamptrainingen tegoed is verzonden`;

  $('#buyMsg')
    .classList
    .remove('hidden');
}


/* =========================
   BEHEER
========================= */

async function showAdmin() {

  if (!isAdmin) {

    toast(
      'Geen beheerdersrechten'
    );

    return;
  }

  $('#appView')
    .classList
    .add('hidden');

  $('#adminView')
    .classList
    .remove('hidden');

  await renderAdmin();
}


/* =========================
   TRAINING TOEVOEGEN
========================= */

async function addLesson() {

  const lesson_date =
    $('#lessonDate').value;

  const lesson_time =
    $('#lessonTime').value;

  const location =
    $('#lessonLocation')
      .value
      .trim();

  const max_participants =
    Number(
      $('#lessonMax').value
    );

  if (
    !lesson_date ||
    !lesson_time ||
    !location ||
    !max_participants
  ) {

    toast(
      'Vul alle velden in'
    );

    return;
  }

  const { error } =
    await supabaseClient
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

  $('#lessonLocation').value =
    '';

  toast(
    'Training toegevoegd'
  );

  await loadData();
  await renderAdmin();
}


/* =========================
   BEHEER TONEN
========================= */

async function renderAdmin() {

  
const {
  data: members,
  error: memberError
} = await supabaseClient
  .from('profiles')
  .select(
    'id,name,email,rides'
  )
  .order('name');

if (memberError) {
  console.error(
    memberError
  );
}
 


  const {
    data: bookings,
    error: bookingError
  } =
    await supabaseClient
      .from('bookings')
      .select(
        'lesson_id,user_id'
      );

  if (bookingError) {
    console.error(
      bookingError
    );
  }


  $('#adminMembers').innerHTML =
    members?.length

      ? `

        <table class="table">

          <thead>

            <tr>
              <th>Naam</th>
              <th>E-mail</th>
              <th>Training tegoed</th>
              <th>Ingeschreven</th>
              <th>Actie</th>

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
                    ${m.rides}
                  </strong>
                </td>
<td>
  ${(bookings || []).filter(b => b.user_id === m.id).length}
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
</td>
</tr>
            `).join('')}

          </tbody>

        </table>
      `

      : '<p>Nog geen deelnemers.</p>';


  $('#adminLessons').innerHTML =
    lessons.length

      ? await Promise.all(lessons.map(async l => {

          const bs =
            (bookings || [])
              .filter(
                b =>
                  b.lesson_id ===
                  l.id
              );
const ws =
  (await supabaseClient
    .from('waitlist')
    .select('id')
    .eq('lesson_id', l.id)
  ).data || [];
          return `

            <div class="lesson">

              <div>

                <h3>
                  ${esc(
                    fmtDate(
                      l.lesson_date
                    )
                  )}
                  •
                  ${esc(
                    String(
                      l.lesson_time
                    ).slice(0, 5)
                  )}
                </h3>

                <div class="meta">

                  📍
                  ${esc(l.location)}

                  ·

                  ${bs.length}/${l.max_participants} deelnemers
· ${ws.length} reserve

                </div>

              </div>

            </div>
          `;

      })).then(items => items.join(''))

      : '<p>Nog geen trainingen.</p>';
}
async function saveAnnouncement() {
  if (!isAdmin) {
    toast('Geen toegang');
    return;
  }

  const title = $('#adminAnnouncementTitle').value.trim();
  const message = $('#adminAnnouncementMessage').value.trim();
  const startsAt = $('#adminAnnouncementStarts').value || new Date().toISOString().slice(0, 10);
  const endsAt = $('#adminAnnouncementEnds').value || null;
  const active = $('#adminAnnouncementActive').checked;

  if (!title || !message) {
    toast('Vul titel en bericht in');
    return;
  }

  const { error: deactivateError } = await supabaseClient
    .from('announcements')
    .update({ active: false })
    .eq('active', true);

  if (deactivateError) {
    console.error(deactivateError);
    toast('Mededeling opslaan mislukt');
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
    toast('Mededeling opslaan mislukt');
    return;
  }

  toast('Mededeling opgeslagen');

  await loadData();
  render();
}
async function changeCredit(userId, amount) {
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('rides')
    .eq('id', userId)
    .single();

  if (error) {
    console.error(error);
    toast('Training tegoed aanpassen mislukt');
    return;
  }

  const newRides = Math.max(0, Number(profile.rides || 0) + amount);

  const { error: updateError } = await supabaseClient
    .from('profiles')
    .update({ rides: newRides })
    .eq('id', userId);

  if (updateError) {
    console.error(updateError);
    toast('Training tegoed aanpassen mislukt');
    return;
  }

  toast('Training tegoed aangepast');
  await renderAdmin();
}

/* =========================
   KNOPPEN
========================= */

$('#signUpBtn').onclick =
  signUp;

$('#loginBtn').onclick =
  signIn;

$('#logoutBtn').onclick =
  signOut;

$('#adminTabBtn').onclick =
  showAdmin;

$('#adminLogout').onclick =
  showApp;
$('#saveAnnouncementBtn').onclick = saveAnnouncement;
$('#addLesson').onclick =
  addLesson;
$('#adminMembers').onclick = async (e) => {
  const minusBtn = e.target.closest('[data-credit-minus]');
  const plusBtn = e.target.closest('[data-credit-plus]');

  if (minusBtn) {
    await changeCredit(minusBtn.dataset.creditMinus, -1);
  }

  if (plusBtn) {
    await changeCredit(plusBtn.dataset.creditPlus, 1);
  }
};

/* =========================
   TABBLADEN
========================= */

$$('.tab[data-tab]').forEach(
  btn => {

    btn.onclick = () => {

      $$('.tab')
        .forEach(
          b =>
            b.classList
              .remove('active')
        );

      btn.classList
        .add('active');

      $$('.panel')
        .forEach(
          p =>
            p.classList
              .add('hidden')
        );

      $('#' + btn.dataset.tab)
        .classList
        .remove('hidden');
    };

  }
);


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

supabaseClient.auth
  .onAuthStateChange(
    async (
      _event,
      newSession
    ) => {

      session =
        newSession;

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
   START APP
========================= */

refreshSession();
