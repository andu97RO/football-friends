# Email setup before public registration

Supabase's **custom SMTP is currently disabled** for the Football Friends project. Its built-in sender is restricted to project team addresses, so public signup and password recovery cannot be opened yet. Keep the Vercel candidate protected until the steps below and a real delivery test are complete.

1. Obtain a domain you control, such as `footballfriends.example`. You can use its root domain or a sending subdomain such as `mail.footballfriends.example`. The domain's registrar must let you add DNS records.
2. Choose a transactional email service that supplies SMTP credentials and supports your domain. Set up the domain in that service. Add the exact SPF, DKIM and, if offered, return-path or DMARC DNS records it provides. Wait for its dashboard to report the domain as verified. Keep the SMTP password in the provider and Supabase settings; never add it to `.env`, Vercel frontend variables, Git, or a chat message.
3. In the [Supabase SMTP settings](https://supabase.com/dashboard/project/exqtxouswbcunrgxftzr/auth/smtp), turn on **Enable custom SMTP**. Enter the provider's host, port, username and password, a sender address on your verified domain, and a recognizable sender name. Save. Check the provider's sending limits against expected signup traffic.
4. In [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/exqtxouswbcunrgxftzr/auth/url-configuration), set the **Site URL** to the assigned stable URL `https://football-friends-seven.vercel.app`. Add `https://football-friends-seven.vercel.app/callback` to redirect URLs. Add preview callbacks only for this Vercel project. Email confirmation is currently enabled; leave it enabled.
5. After the protected candidate is deployed, register with a fresh address that is **not** on the Supabase project team. Confirm that the message arrives, opens `/callback`, and permits login. Request a password reset, open its link, set a new password, then verify the old password fails. Repeat with an expired link to confirm a clear recovery path.
6. Check the email service's delivery log and Supabase Auth logs for rejected messages. Record the passing delivery tests in the release checklist before opening the public URL.

The group migration removed the old `on_auth_user_created_confirm` trigger that marked new users confirmed automatically. A real unconfirmed signup must still be checked before opening registration.

See [Supabase's custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) for the current provider and sender requirements.
