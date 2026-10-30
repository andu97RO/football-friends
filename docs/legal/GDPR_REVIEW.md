# Review GDPR și legal – Football Friends

Data: 22 octombrie 2026. Acoperă codul din `main` (710f84a) și proiectul Supabase `exqtxouswbcunrgxftzr`.

> Nu este consultanță juridică. Pentru o aplicație mică și gratuită, lista de mai jos acoperă ce e uzual. Înainte de a lansa public, cere unui avocat GDPR să verifice textele finale. Costul e de obicei câteva sute de euro.

## Ce e deja bine

| Zonă | Stare |
|---|---|
| Ștergerea contului în aplicație (GDPR art. 17, App Store 5.1.1(v)) | ✅ `delete-account` + trigger `cleanup_deleted_auth_user`. Șterge poza, înscrierile, chatul, voturile și notele și transferă grupurile |
| Locația datelor | ✅ Supabase `eu-north-1` (Stockholm), deci în UE |
| Controlul accesului | ✅ RLS pe toate tabelele, privilegii pe coloane, notele sunt private (doar adminii le văd) |
| Emailul nu e expus altor utilizatori | ✅ `profile` nu conține email, iar `group_members()` nu îl întoarce |
| Tokenul push nu poate fi citit de alți utilizatori | ✅ nu e în `grant select` pe `profile` |
| Fără analytics, reclame sau trackere terțe | ✅ nici un SDK de tracking în `package.json`, fonturile sunt incluse local |
| Minimizare | ✅ se cer doar nume, email și nota. Fără telefon, dată de naștere sau locație |

## Probleme găsite, în ordinea priorității

### 🔴 1. Lipseau Politica de confidențialitate și Termenii (GDPR art. 13, App Store, Google Play)
GDPR cere să informezi utilizatorii **la colectare**. Apple și Google resping aplicațiile fără un URL public de privacy policy.
**Rezolvat în acest branch:** `public/privacy.html` și `public/terms.html` (RO + EN), servite la `/privacy.html` și `/terms.html`. Link-urile apar pe Login, pe Sign-up (sub butoane) și în Profil.
**De făcut de tine:**
- completează câmpurile `[ÎNTRE PARANTEZE]`: identitatea operatorului, adresa, emailul de contact, furnizorul de email, perioadele de retenție;
- site-ul Vercel trebuie să fie **public** (docs/EMAIL_SETUP.md spune că e protejat). Altfel Apple și Google nu pot deschide linkul;
- pune URL-ul în App Store Connect (Privacy Policy URL) și în Google Play Console.

### 🔴 2. `NSUserTrackingUsageDescription` în `app.json`
Cheia declară App Tracking Transparency, cu un text fals („notificări”). Aplicația nu face tracking. Apple respinge build-urile cu cheie ATT fără tracking real, iar textul e înșelător.
**Rezolvat:** cheia a fost scoasă.

### 🟠 3. Emailurile se trimit prin Gmail personal (App Password)
docs/AUTH_EMAIL_OTP.md spune că SMTP-ul e configurat cu adresa ta de Gmail. Asta înseamnă:
- adresa ta personală apare ca expeditor la toți utilizatorii;
- Gmail pentru consumatori nu are DPA (acord de prelucrare), deci Google nu e „persoană împuternicită” contractual;
- limitele Gmail și reputația contului tău personal sunt la risc.
**Recomandare:** un furnizor tranzacțional cu DPA și domeniu propriu, de exemplu Brevo (UE), Resend sau Postmark. Apoi trece-l în secțiunea 5 din politică.

### 🟠 4. DPA-uri cu furnizorii (GDPR art. 28)
Ai nevoie de un acord de prelucrare cu fiecare furnizor care atinge date personale:
- **Supabase**: semnează DPA din Dashboard → Organization → Legal Documents;
- **Vercel**: DPA inclus în termeni (vercel.com/legal/dpa). Descarcă-l și păstrează-l;
- **Expo**: DPA disponibil la expo.dev/privacy (pentru push);
- **furnizorul de email**: vezi punctul 3.
Păstrează PDF-urile într-un folder. Ele sunt dovada ta dacă te întreabă ANSPDCP.

### 🟠 5. Conținut generat de utilizatori: chat, nume, poze (App Store 1.2, DSA)
Apple cere pentru aplicațiile cu UGC: filtrarea conținutului, **raportarea** conținutului sau a utilizatorilor, **blocarea** utilizatorilor abuzivi și un contact publicat. DSA cere oricărui serviciu de hosting un punct de contact și un mecanism de notificare (art. 11, 12, 16). Microîntreprinderile sunt scutite de majoritatea celorlalte obligații.
**Acum:** Termenii (secțiunea 9) dau un email de raportare, iar adminii pot scoate membri din grupuri. Pentru grupuri închise cu invitație, de multe ori ajunge pentru review-ul Apple, dar nu e garantat.
**De făcut, dacă Apple cere:** un buton „Raportează” pe mesajele din chat (trimite un email sau scrie într-un tabel `report`) și posibilitatea ca autorul sau adminul să șteargă un mesaj.

### 🟡 6. Pozele de profil sunt într-un bucket public
`avatars` e `public = true`, deci oricine are URL-ul (care conține UUID-ul userului) vede poza, chiar fără cont. E declarat în politică (secțiunea 4). Varianta mai strictă: bucket privat cu signed URLs, dacă vrei să elimini și acest risc.

### 🟡 7. Jurnalul de audit nu are termen de păstrare
`audit_log` păstrează nelimitat `user_id` și `meta` (inclusiv `target` = alt utilizator). După ștergerea contului rămâne doar UUID-ul, ceea ce e acceptabil ca pseudonim, dar GDPR cere o retenție definită (art. 5(1)(e)).
**Recomandare:** un job `pg_cron` zilnic:
```sql
select cron.schedule('audit-retention', '0 3 * * *',
  $$delete from public.audit_log where created_at < now() - interval '12 months'$$);
```
Același job poate goli `team_notification_outbox` după procesare.

### 🟡 8. Dreptul de acces și portabilitate (art. 15, 20)
Nu există export în aplicație. E legal să răspunzi manual pe email în maximum 30 de zile, cu un JSON care conține profilul, membership-urile cu nota, înscrierile, mesajele și voturile. Dacă cererile devin dese, poți face o funcție `export-account` care întoarce totul.

### 🟡 9. Securitate (art. 32)
- Advisor Supabase: **Leaked password protection** e dezactivată (necesită plan Pro). Ca alternativă, poți crește lungimea minimă a parolei;
- `team_notification_outbox` are RLS fără politici. E OK, pentru că e accesat doar de `service_role`;
- avertizările GraphQL („tabel vizibil”) sunt informative: RLS protejează rândurile. Dacă nu folosești GraphQL, poți dezactiva extensia `pg_graphql`.

### 🟡 10. Vârsta minimă
În România, vârsta pentru consimțământ digital este 16 ani. Termenii și politica cer 16+, iar Login și Sign-up afișează asta. Nu e nevoie de verificarea vârstei, doar de declarație. La App Store alege ratingul 12+ (chat între utilizatori).

### ℹ️ 11. Cine e „operator”?
Dacă aplicația e publică, **tu** (persoană fizică sau firmă) ești operatorul. Organizatorii de grup care își joacă meciurile între prieteni intră de regulă la „activitate personală” (excepția casnică, art. 2(2)(c)). Termenii le cer să folosească datele doar în aplicație. Ca să limitezi răspunderea personală, poți opera aplicația printr-un PFA sau SRL. Atunci în politică apare firma, nu numele tău.

### ℹ️ 12. Cookie-uri
Web-ul folosește doar `localStorage` strict necesar (sesiune, limbă, invitație). **Nu e nevoie de banner de cookie-uri** cât timp nu adaugi analytics. Dacă adaugi (de exemplu Vercel Analytics, PostHog sau Sentry cu replay), recitește politica și decide dacă îți trebuie consimțământ.

## Checklist înainte de lansarea publică

Decizii din 30 octombrie 2026: aplicația rămâne doar pe web deocamdată. Emailurile rămân pe Gmail (acceptabil pentru ~50 de utilizatori). Operator: Bogdan Petru Andrei, București.

- [x] Completează placeholder-ele din `public/privacy.html` și `public/terms.html`
- [x] Deploy-ul Vercel e public (verifică `/privacy.html` și `/terms.html` după merge)
- [ ] Salvează PDF-ul DPA-ului Supabase (supabase.com/legal/dpa). Face parte din termeni, nu trebuie semnat separat
- [x] Jobul de retenție pentru `audit_log` (12 luni, promis în politică): migrarea `20261030120000_security_and_retention.sql`, aplicată în producție pe 30 octombrie 2026
- [ ] La lansarea aplicațiilor mobile: adaugă înapoi în politică notificările push (Expo, Apple, Google), raportarea în chat, App Privacy și Data safety
- [ ] (opțional) Cont Gmail separat sau furnizor tranzacțional cu DPA, când crește numărul de utilizatori
- [ ] (opțional) Revizuire de către un avocat

### Răspunsuri pentru App Store „App Privacy” și Google Play „Data safety”

| Date | Colectat | Legat de identitate | Tracking | Scop |
|---|---|---|---|---|
| Nume (display name) | Da | Da | Nu | Funcționalitatea aplicației |
| Email | Da | Da | Nu | Funcționalitatea aplicației (cont) |
| Fotografii (avatar, opțional) | Da | Da | Nu | Funcționalitatea aplicației |
| Mesaje (chat) | Da | Da | Nu | Funcționalitatea aplicației |
| Alt conținut generat (note, rezultate) | Da | Da | Nu | Funcționalitatea aplicației |
| User ID | Da | Da | Nu | Funcționalitatea aplicației |
| Device ID (push token) | Da | Da | Nu | Funcționalitatea aplicației |
| Locație, contacte, istoric navigare, date financiare | Nu | – | – | – |

Google Play: datele sunt criptate în tranzit, utilizatorul poate cere ștergerea (în aplicație), datele nu se partajează cu terți în afara furnizorilor de servicii.

## Registrul activităților de prelucrare (art. 30, varianta scurtă)

Firmele sub 250 de angajați sunt scutite doar dacă prelucrarea e ocazională. Aici prelucrarea e continuă, deci păstrează acest tabel actualizat.

| Activitate | Persoane vizate | Date | Temei | Destinatari | Retenție |
|---|---|---|---|---|---|
| Conturi și autentificare | utilizatori | email, hash parolă, ID Google | art. 6(1)(b) | Supabase, furnizor email, Google (OAuth) | până la ștergerea contului |
| Profil și grupuri | utilizatori | nume, poză, autoevaluare, rol, notă de admin | art. 6(1)(b) | membri sau admini de grup, Supabase | până la ștergerea contului sau ieșirea din grup |
| Meciuri și echipe | utilizatori | înscrieri, echipe, scor, prezență, plată, voturi, istoric note | art. 6(1)(b) | membri de grup, Supabase | cât există meciul sau grupul |
| Chat | utilizatori | mesaje | art. 6(1)(b) | membri de grup, Supabase, Expo/APNs/FCM (preview) | cât există meciul sau contul |
| Notificări push | utilizatori care au acceptat | push token, preview mesaj | art. 6(1)(a) | Expo, Apple, Google | până la logout sau ștergere |
| Securitate și audit | utilizatori | IP, loguri, acțiuni admin | art. 6(1)(f) | Supabase, Vercel | 12 luni (după implementarea jobului) |

## Procedură pentru incidente de securitate (art. 33–34)

1. Oprește scurgerea: rotește cheile Supabase (`service_role`, JWT secret), revocă sesiunile.
2. Notează ce s-a întâmplat, când, ce date și câți utilizatori sunt afectați.
3. Dacă există risc pentru utilizatori, notifică **ANSPDCP în maximum 72 de ore** (formular pe dataprotection.ro).
4. Dacă riscul e ridicat (de exemplu emailuri și parole expuse), anunță și utilizatorii.
5. Păstrează în registru fiecare incident, inclusiv pe cele nenotificate.
