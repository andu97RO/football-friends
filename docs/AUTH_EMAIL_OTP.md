# Autentificare prin cod email — verificare 15 octombrie 2026

## Ce s-a confirmat în proiectul live

Proiect: `exqtxouswbcunrgxftzr` (football-friends), organizație pe plan Free.
Verificare prin pluginul Supabase, folosind SQL doar pentru citire și logurile Auth.

- La 13:14:44 și 13:15:04, ora Bucureștiului, Auth a răspuns cu HTTP 429,
  `over_email_send_rate_limit`, pe `/otp`, respectiv `/signup`.
- Cele 30 de conturi Auth au toate câte un rând în `public.profile`;
  29 sunt confirmate. Triggerul `group_signup_profile` este activ.
- Contul verificat la cererea utilizatorului, creat prin email în acea zi,
  are profil și onboarding complet, dar zero apartenențe la grupuri.
  Autentificarea nu înscrie automat utilizatorul într-un grup: acesta trebuie
  să accepte invitația `/join/COD`. Nu adăuga apartenențe global la autentificare.
- Captura dashboard-ului furnizată ulterior de utilizator confirmă **2 emailuri/oră**,
  **150 token refresh / 5 minute / IP**, **30 verificări / 5 minute / IP** și
  **30 signup/signin / 5 minute / IP**. SMS, utilizatorii anonimi și Web3 au
  limite separate și nu sunt folosite de aceste fluxuri.
- Conexiunea MCP nu expune configurația Auth/SMTP. CLI nu are token Management API,
  iar dashboard-ul agentului cere autentificare. Furnizorul SMTP și eventualul Send
  Email hook NU au fost confirmate. Cota de 2 emailuri/oră este confirmată prin
  captura utilizatorului; planul Free nu dovedește singur utilizarea SMTP-ului implicit.

## Ce se întâmplă cu 30 de prieteni

| Flux | Consum de emailuri Auth | Condiții și rezultat |
| --- | --- | --- |
| Google OAuth | 0 în fluxul normal | Nu consumă cota SMTP. Rămân aplicabile limitele endpointurilor Auth și restricțiile Google. Nu există dovada unui test real cu 30 de sesiuni. |
| Magic link sau cod OTP | 30 pentru o cerere de persoană | Aceeași cotă de emailuri; schimbarea linkului cu un cod nu o mărește. Dacă rămân numai N trimiteri, cel mult N pot trece de cota Supabase; restul primesc 429, fără email trimis și fără sesiune nouă. Livrarea poate avea și erori ale furnizorului. |
| Invitație Auth prin email, apoi OTP | Până la 60 | Invitațiile Auth și OTP-urile consumă din cotele de livrare; un simplu link de grup trimis în afara Supabase nu consumă cota SMTP Supabase. |

Cu SMTP-ul integrat, documentația indică **2 emailuri/oră/proiect**, către adrese
preautorizate din echipa proiectului. În scenariul cu 30 de adrese eligibile și
cotă complet disponibilă, cel mult 2 primesc emailuri, iar cel puțin 28 sunt
refuzate de cotă. Alte adrese pot fi refuzate ca neautorizate.

Cu SMTP personalizat, documentația indică o cotă inițială de **30 emailuri/oră**,
configurabilă. 30 de cereri ar consuma integral acea cotă dacă este încă disponibilă;
retrimiterea, confirmarea sau recuperarea parolei pot epuiza bugetul disponibil.
Există separat limitele furnizorului SMTP.

Pentru prieteni pe același Wi-Fi, IP-ul public este comun. Documentația curentă
indică implicit 30 de cereri/5 minute pentru signup/signin și verificare,
cu burst de 30, respectiv 150/5 minute pentru token cu burst de 30.
Un grup de 30 ajunge la capacitatea burst; tentativele anterioare și reîncercările
pot provoca 429. Pe IP-uri diferite, limitele pe IP sunt separate, dar cota email
rămâne comună întregului proiect. Aceste trei valori sunt confirmate și în captura dashboard-ului furnizată de utilizator.

## Activare înainte de publicarea aplicației

Codul aplicației folosește `signInWithOtp({ options: { shouldCreateUser: true } })`
și `verifyOtp({ email, token, type: 'email' })`. Crearea profilului este deja
asigurată de triggerul din migrațiile existente și verificată și de aplicație.
Nu este necesară o migrare nouă pentru profiluri. Layout-ul așteaptă încărcarea
profilului înainte de redirecționarea către invitația salvată, astfel încât un
utilizator nou să finalizeze mai întâi onboarding-ul.

În Authentication → Email Templates:

1. Pentru **Magic Link**, setează corpul din
   `supabase/templates/magic_link.html` și un subiect precum
   `FootyFriends — Cod de conectare / Sign-in code`.
2. Pentru **Confirm signup**, setează corpul din
   `supabase/templates/confirmation.html`. Acesta include codul pentru prima
   autentificare OTP și păstrează linkul pentru înregistrarea cu parolă.
3. Păstrează confirmarea emailului activă. Nu modifica template-ul de recuperare.
4. Limita confirmată în Rate Limits este de 2 emailuri/oră. Verifică setările SMTP/Send Email hook.
   Pentru 30 de prieteni, SMTP-ul integrat este insuficient; configurează
   livrare proprie și buget suficient pentru invitații, OTP, retrimiteri și resetări,
   în limitele furnizorului ales.
5. Publică aplicația după actualizarea template-urilor. Altfel, interfața cere
   un cod pe care emailul vechi s-ar putea să nu îl afișeze.
6. Verifică livrarea reală cu un utilizator nou și unul existent: cod valid,
   cod greșit/expirat, retrimitere, onboarding și acceptarea invitației.
   Testele browser izolate nu verifică SMTP-ul sau livrarea în inbox.

Agentul nu a modificat setările/template-urile live sau aplicația publicată.
Ulterior, utilizatorul a raportat că a finalizat configurarea SMTP cu adresa sa
Gmail și un Google App Password. Noua cotă, template-urile live și livrarea reală
rămân de verificat înainte de publicare; raportarea configurării nu confirmă
livrarea. Nu s-au trimis 30 de emailuri și nu s-au creat conturi de test live.

## Surse

- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Passwordless email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)

## Validare locală

- Node 22.23.3, TypeScript fără erori.
- ESLint: fișierele modificate fără avertismente; verificarea integrală are 103 avertismente existente și zero erori.
- Export web și verificarea configurației publice: trecute.
- PostgreSQL/PGlite: 130 verificări trecute.
- Playwright: 132 teste trecute pe desktop Chromium, Mobile Chrome și Mobile Safari,
  cu backend simulat. Include login cu cod, profil lipsă, onboarding înaintea
  invitației, acceptarea invitației, cod invalid/expirat, cotă email și retrimitere.
