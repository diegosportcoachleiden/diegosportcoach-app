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
    console.error('Verlopen tegoed op 0 zetten mislukt:', expireError);
  } else {
    profile.rides = 0;
  }
}
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

  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#adminView').classList.add('hidden');
  $('#logoutBtn').classList.remove('hidden');

  showHomeScreenTip();

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
async function forgotPassword() {
  const email = $('#emailInput').value.trim();

  if (!email) {
    toast('Vul eerst je e-mailadres in');
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
  redirectTo: 'https://diegosportcoachleiden.github.io/diegosportcoach-app/'
  });

  if (error) {
    toast('Resetlink versturen mislukt: ' + error.message);
    return;
  }

  toast('Resetlink verstuurd! Controleer je e-mail.');
}
async function saveNewPassword() {
  const password = $('#newPasswordInput').value;

  if (password.length < 6) {
    toast('Wachtwoord moet minimaal 6 tekens zijn');
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({
    password: password
  });

  if (error) {
    toast('Wachtwoord wijzigen mislukt: ' + error.message);
    return;
  }

  toast('Wachtwoord succesvol gewijzigd!');

  $('#resetPasswordView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');

  await supabaseClient.auth.signOut();
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
const expiryEl = $('#creditExpiry');

if (expiryEl) {
  if (profile.credit_expires_at && (profile.rides || 0) > 0) {
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
  const box = $('#lessenContent');

  const now = new Date();

  const upcomingLessons = lessons
    .filter(l => {
      const dateTime = new Date(
        `${l.lesson_date}T${String(l.lesson_time).slice(0, 5)}:00`
      );

    return dateTime >= new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() - ((now.getDay() + 6) % 7)
);
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

  if (!upcomingLessons.length) {
    box.innerHTML = `
      <div class="card">
        <p>Er staan nog geen trainingen gepland.</p>
      </div>
    `;
    return;
  }

  // Toon alle komende trainingen van dezelfde trainingsweek.
const firstLessonDate = new Date(
  `${upcomingLessons[0].lesson_date}T12:00:00`
);

const endOfWeek = new Date(firstLessonDate);
const dayOfWeek = endOfWeek.getDay();

endOfWeek.setDate(
  endOfWeek.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek)
);

endOfWeek.setHours(23, 59, 59, 999);

const displayLessons = upcomingLessons.filter(lesson => {
  const lessonDate = new Date(
    `${lesson.lesson_date}T12:00:00`
  );

  return lessonDate <= endOfWeek;
});

  box.innerHTML = `
    <div class="card">
 <h2>Bootcamptrainingen deze week</h2>    

      ${displayLessons.map(l => {
        const mine = myBookings.includes(l.id);
        const waiting = myWaitlist.includes(l.id);

        const count = Number(l.booking_count || 0);
        const maxParticipants = Number(l.max_participants || 0);
        const full = count >= maxParticipants;

        const lessonStarted = new Date(
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
  class="${lessonStarted ? 'secondary' : (mine ? 'secondary' : 'primary')}"
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

      if (myBookings.includes(id)) {
        await toggleBooking(id);
        return;
      }

      if (myWaitlist.includes(id)) {
        await toggleWaitlist(id);
        return;
      }

      const lesson = lessons.find(l => l.id === id);

      if (!lesson) {
        toast('Training niet gevonden');
        return;
      }

      const full =
        Number(lesson.booking_count || 0) >=
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

  const mine =
    myBookings.includes(id);

  const lesson =
    lessons.find(l => l.id === id);

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
const isWeekend = day === 0 || day === 6;

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

  if (!confirmed) {
    return;
  }
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
if (Number(rides) === 1) {
  window.location.href =
    'https://betaalverzoek.rabobank.nl/betaalverzoek/?id=pxnbV_fjTNi3UrUkhqZ0Yg';
  return;
}
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
async function addWeekLessons() {
  const max_participants = Number($('#weekMax').value);

  const checkedDays = [
    ...document.querySelectorAll('.weekEnabled:checked')
  ];

  if (!checkedDays.length || !max_participants) {
    toast('Kies minimaal één trainingsdag');
    return;
  }

  // Bepaal maandag van de huidige week
  const today = new Date();
  const day = today.getDay();

  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(
    today.getDate() - ((day + 6) % 7)
  );

  const newLessons = [];

  for (const checkbox of checkedDays) {
    const targetDay = Number(checkbox.dataset.day);
    const slot = checkbox.dataset.slot || '1';

    const timeInput = document.querySelector(
      `.weekTime[data-day="${targetDay}"][data-slot="${slot}"]`
    );

    const lesson_time = timeInput?.value;

    if (!lesson_time) continue;

    const location =
      checkbox.dataset.location ||
      $('#weekLocation')?.value.trim() ||
      'Station De Vink';

    // zondag = 0, maandag = 1 enz.
    const offset =
      targetDay === 0
        ? 6
        : targetDay - 1;

    const lessonDate = new Date(monday);

    lessonDate.setDate(
      monday.getDate() + offset
    );

    // Als deze training deze week al voorbij is,
    // wordt dezelfde training volgende week toegevoegd.
    const now = new Date();

    const lessonDateTime =
      new Date(lessonDate);

    const [hours, minutes] =
      lesson_time.split(':');

    lessonDateTime.setHours(
      Number(hours),
      Number(minutes),
      0,
      0
    );

    if (lessonDateTime <= now) {
      lessonDate.setDate(
        lessonDate.getDate() + 7
      );
    }

    const lesson_date =
      `${lessonDate.getFullYear()}-` +
      `${String(lessonDate.getMonth() + 1).padStart(2, '0')}-` +
      `${String(lessonDate.getDate()).padStart(2, '0')}`;

    const alreadyExists =
  lessons.some(l =>
    l.lesson_date === lesson_date &&
    String(l.lesson_time).slice(0, 5) === String(lesson_time).slice(0, 5)
  ) ||
  newLessons.some(l =>
    l.lesson_date === lesson_date &&
    String(l.lesson_time).slice(0, 5) === String(lesson_time).slice(0, 5)
  );

if (alreadyExists) {
  continue;
}
    newLessons.push({
      lesson_date,
      lesson_time,
      location,
      max_participants
    });
  }

  if (!newLessons.length) {
    toast('Geen geldige trainingen geselecteerd');
    return;
  }

  const { error } =
    await supabaseClient
      .from('lessons')
      .insert(newLessons);

  if (error) {
    console.error(error);
    toast(error.message);
    return;
  }

  toast(
    `${newLessons.length} trainingen toegevoegd`
  );

  document
    .querySelectorAll('.weekEnabled')
    .forEach(el => el.checked = false);

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
    'id,name,email,rides,credit_expires_at'
  )
  .order('name');
const membersById = Object.fromEntries(
  (members || []).map(member => [member.id, member])
);
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


$('#adminCustomers').innerHTML =
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
  ${
    m.credit_expires_at && Number(m.rides || 0) > 0
      ? new Date(m.credit_expires_at).toLocaleDateString('nl-NL', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
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
const attendees = bs.map(booking => {
  const member = membersById[booking.user_id];

  return member
    ? member.name || member.email
    : 'Onbekende deelnemer';
});
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
${attendees.length
  ? `<div class="meta"><strong>Aangemeld:</strong><br>${attendees
      .map(name => `• ${esc(name)}`)
      .join('<br>')}</div>`
  : '<div class="meta"><strong>Aangemeld:</strong> niemand</div>'
}
                </div>

              </div>

            </div>
          `;

      })).then(items => items.join(''))

      : '<p>Nog geen trainingen.</p>';
}
const customerSearch = $('#customerSearch');

if (customerSearch) {
  customerSearch.oninput = () => {
    const zoekterm = customerSearch.value.trim().toLowerCase();

    $$('#adminCustomers tbody tr').forEach(row => {
      const naam = row.children[0]?.textContent.toLowerCase() || '';
      const email = row.children[1]?.textContent.toLowerCase() || '';

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
    .update({ active: false })
    .eq('active', true);

  if (error) {
    console.error(error);
    toast('Mededeling verwijderen mislukt');
    return;
  }

  $('#adminAnnouncementTitle').value = '';
  $('#adminAnnouncementMessage').value = '';
  $('#adminAnnouncementStarts').value = '';
  $('#adminAnnouncementEnds').value = '';
  $('#adminAnnouncementActive').checked = false;

  toast('Mededeling verwijderd');

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
    .update({
  rides: newRides,
  ...(amount > 0 && {
    credit_expires_at: new Date(
      new Date().setFullYear(new Date().getFullYear() + 1)
    ).toISOString()
  })
})
    .eq('id', userId);

  if (updateError) {
    console.error(updateError);
    toast('Training tegoed aanpassen mislukt');
    return;
  }

  toast('Training tegoed aangepast');
  await renderAdmin();
}


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-delete-customer]');

  if (!btn) return;

  const customerId = btn.dataset.deleteCustomer;

  if (!isAdmin) {
    toast('Alleen de beheerder kan klanten verwijderen');
    return;
  }

  if (customerId === session?.user?.id) {
    toast('Je kunt je eigen beheerdersaccount niet verwijderen');
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
    console.error('Klant verwijderen mislukt:', error);
    toast('Verwijderen mislukt: ' + error.message);

    btn.disabled = false;
    btn.textContent = oudeTekst;
    return;
  }

  const rij = btn.closest('tr');

  if (rij) {
    rij.remove();
  }

  toast('Klant volledig verwijderd');
});

  
/* =========================
   KNOPPEN
========================= */

$('#signUpBtn').onclick =
  signUp;

$('#loginBtn').onclick =
  signIn;
$('#forgotPasswordBtn').onclick = forgotPassword;
$('#saveNewPasswordBtn').onclick = saveNewPassword;
$('#logoutBtn').onclick =
  signOut;

$('#adminTabBtn').onclick =
  showAdmin;

$('#adminLogout').onclick =
  showApp;
$('#saveAnnouncementBtn').onclick = saveAnnouncement;
$('#deleteAnnouncementBtn').onclick = deleteAnnouncement;
$('#addLesson').onclick =
  addLesson;
$('#addWeekLessons').onclick =
  addWeekLessons;
$('#adminCustomers').onclick = async (e) => {
  const minusBtn = e.target.closest('[data-credit-minus]');
  const plusBtn = e.target.closest('[data-credit-plus]');
  const addBtn = e.target.closest('[data-credit-add]');
  
  if (minusBtn) {
    await changeCredit(minusBtn.dataset.creditMinus, -1);
  }
if (addBtn) {
  const amount = Number(addBtn.dataset.amount || 0);

  if (amount > 0) {
    await changeCredit(addBtn.dataset.creditAdd, amount);
  }

  return;
}
  if (plusBtn) {
    await changeCredit(plusBtn.dataset.creditPlus, 1);
  }
};

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

    $('#' + btn.dataset.tab).classList.remove('hidden');
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

supabaseClient.auth
  .onAuthStateChange(
    async (
      _event,
      newSession
    ) => {
if (_event === 'PASSWORD_RECOVERY') {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.add('hidden');
  $('#adminView').classList.add('hidden');
  $('#logoutBtn').classList.add('hidden');
  $('#resetPasswordView').classList.remove('hidden');
  return;
}
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

function urlBase64ToUint8Array(base64String) {
  const padding =
    '='.repeat((4 - (base64String.length % 4)) % 4);

  const base64 =
    (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

  const rawData = atob(base64);

  return Uint8Array.from(
    [...rawData].map(char => char.charCodeAt(0))
  );
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration =
      await navigator.serviceWorker.register('./sw.js', {
        updateViaCache: 'none'
      });

    await registration.update();

    return registration;
  } catch (error) {
    console.error(
      'Service worker registreren mislukt:',
      error
    );

    return null;
  }
}

async function enableNotifications() {
  if (!session?.user) {
    toast('Log eerst in om meldingen aan te zetten');
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
      toast('Meldingen zijn niet toegestaan');
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
      urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
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
            user_id: session.user.id,
            endpoint: subscription.endpoint,
            p256dh: subscriptionData.keys.p256dh,
            auth: subscriptionData.keys.auth
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
      'Meldingen aanzetten mislukt'
    );
  }
}

const enableNotificationsBtn =
  $('#enableNotificationsBtn');

if (enableNotificationsBtn) {
  enableNotificationsBtn.onclick =
    enableNotifications;
}

async function startApp() {
  const registration = await registerServiceWorker();

  if (registration) {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'activated' &&
            navigator.serviceWorker.controller
          ) {
            window.location.reload();
          }
        });
      }
    });
  }

  await refreshSession();
}

startApp();
