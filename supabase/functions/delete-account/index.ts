import { serve, serviceClient } from '../_shared/common.ts';

// P4: in-app account deletion. Group data is handed on or removed as the user,
// then the auth user is deleted with the service role.
serve(async ({ user, db }) => {
  const { error } = await db.rpc('delete_account_data');
  if (error) throw error;
  const { error: deleteError } = await serviceClient().auth.admin.deleteUser(user.id);
  if (deleteError) throw deleteError;
  return { deleted: true };
});
