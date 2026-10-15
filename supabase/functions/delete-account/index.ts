import { serve, serviceClient } from '../_shared/common.ts';

serve(async ({ user }) => {
  const service = serviceClient();
  // Remove every owned object (including old avatars), in bounded batches.
  // Any Storage failure happens before group cleanup. The database trigger then
  // cleans up groups atomically with auth deletion, rolling back on any failure.
  let previousBatch = '';
  while (true) {
    const { data: objects, error } = await service.rpc('account_storage_objects', { u: user.id });
    if (error) throw error;
    if (!objects?.length) break;
    const batch = JSON.stringify(objects);
    if (batch === previousBatch) throw new Error('Storage cleanup did not remove the owned objects');
    previousBatch = batch;
    const buckets = new Set<string>(objects.map((o: { bucket_id: string }) => o.bucket_id));
    for (const bucket of buckets) {
      const paths = objects.filter((o: { bucket_id: string }) => o.bucket_id === bucket).map((o: { name: string }) => o.name);
      const { error: storageError } = await service.storage.from(bucket).remove(paths);
      if (storageError) throw storageError;
    }
  }
  const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
  if (deleteError) throw deleteError;
  return { deleted: true };
});
