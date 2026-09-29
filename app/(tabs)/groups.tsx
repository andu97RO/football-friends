import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { groupPlayers, useGroups } from '@/lib/groups';
import { useAuthStore } from '@/lib/auth-store';
import { Club } from '@/lib/types';

function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></TouchableOpacity>;
}

export default function GroupsScreen() {
  const groups = useGroups();
  const userId = useAuthStore((s) => s.session?.user.id);
  const client = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState('');
  const directory = useQuery({
    queryKey: ['group-directory', search],
    queryFn: async () => {
      const { data, error } = await supabase.from('club').select('id,name,description')
        .ilike('name', `%${search.replace(/[%_]/g, '')}%`).order('name').limit(50);
      if (error) throw error;
      return data as Club[];
    },
  });
  const members = useQuery({
    queryKey: ['group-members', groups.current?.club_id, userId],
    enabled: groups.isAdmin,
    queryFn: () => groupPlayers(groups.current!.club_id),
  });
  const action = useMutation({
    mutationFn: async (args: { action: string; g?: string; target?: string; value?: string; description?: string }) => {
      const { data, error } = await supabase.rpc('group_action', args);
      if (error) throw error;
      return { id: data as string, action: args.action };
    },
    onSuccess: async ({ id, action }) => {
      if (action === 'create') { groups.select(id); setName(''); setDescription(''); }
      setNotice(action === 'request' ? 'Request sent. An admin will review it.' : 'Saved');
      await Promise.all(['my-groups', 'group-directory', 'group-members', 'allPlayers', 'group-role'].map((key) => client.invalidateQueries({ queryKey: [key] })));
    },
    onError: (error) => setNotice(error.message),
  });
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.heading}>Your groups</Text>
    <Text style={styles.muted}>Choose a group to see its matches. Membership requires approval.</Text>
    {groups.isLoading && <Text style={styles.text}>Loading groups…</Text>}
    {groups.error && <Text style={styles.error}>{groups.error.message}</Text>}
    {groups.data?.length === 0 && <Text style={styles.text}>Join a group below or create your own.</Text>}
    {groups.data?.map((m) => <View style={styles.card} key={m.club_id}>
      <Text style={styles.title}>{m.club.name}{groups.current?.club_id === m.club_id ? ' · Selected' : ''}</Text>
      <Text style={styles.muted}>{m.status} · {m.role}{m.status === 'approved' ? ` · ${m.rating}/5 stars` : ''}</Text>
      {m.status === 'approved' && <Action title="View matches" onPress={() => { groups.select(m.club_id); router.push('/matches'); }} />}
    </View>)}
    <Text accessibilityRole="alert" style={styles.text}>{notice}</Text>
    <Text style={styles.heading}>Find a group</Text>
    <TextInput accessibilityLabel="Search groups" placeholder="Search groups" placeholderTextColor={theme.colors.textSecondary} value={search} onChangeText={setSearch} style={styles.input} />
    {directory.error && <Text style={styles.error}>{directory.error.message}</Text>}
    {directory.data?.map((g) => {
      const membership = groups.data?.find((m) => m.club_id === g.id);
      return <View key={g.id} style={styles.card}>
        <Text style={styles.title}>{g.name}</Text><Text style={styles.muted}>{g.description}</Text>
        {!membership || membership.status === 'rejected' ? <Action title={membership ? 'Request again' : 'Request to join'} disabled={action.isPending} onPress={() => action.mutate({ action: 'request', g: g.id })} /> : <Text style={styles.text}>{membership.status}</Text>}
      </View>;
    })}
    <Text style={styles.heading}>Create a group</Text>
    <Text style={styles.muted}>You will be its owner and can appoint admins.</Text>
    <TextInput accessibilityLabel="Group name" placeholder="Group name" placeholderTextColor={theme.colors.textSecondary} maxLength={80} value={name} onChangeText={setName} style={styles.input} />
    <TextInput accessibilityLabel="Group description" placeholder="Description (optional)" placeholderTextColor={theme.colors.textSecondary} maxLength={500} multiline value={description} onChangeText={setDescription} style={styles.input} />
    <Action title="Create group" disabled={action.isPending || !name.trim()} onPress={() => action.mutate({ action: 'create', value: name.trim(), description })} />
    {groups.isAdmin && <>
      <Text style={styles.heading}>Manage {groups.current?.club.name}</Text>
      {members.error && <Text style={styles.error}>{members.error.message}</Text>}
      {members.data?.map((m) => <View key={m.user_id} style={styles.card}>
        <Text style={styles.title}>{m.display_name}</Text><Text style={styles.muted}>{m.status} · {m.role} · {m.rating}/5 stars</Text>
        {m.status === 'pending' && <View style={styles.row}>
          <Action title="Approve" disabled={action.isPending} onPress={() => action.mutate({ action: 'review', g: m.club_id, target: m.user_id, value: 'approved' })} />
          <Action title="Reject" disabled={action.isPending} onPress={() => action.mutate({ action: 'review', g: m.club_id, target: m.user_id, value: 'rejected' })} />
        </View>}
        {m.status === 'approved' && <>
          {groups.current?.role === 'owner' && m.role !== 'owner' && <Action title={m.role === 'admin' ? 'Demote to member' : 'Promote to admin'} disabled={action.isPending} onPress={() => action.mutate({ action: 'role', g: m.club_id, target: m.user_id, value: m.role === 'admin' ? 'member' : 'admin' })} />}
          <Text style={styles.text}>Group rating</Text>
          <View style={styles.row}>{[0,1,2,3,4,5].map((rating) => <Action key={rating} title={`${rating} ★`} disabled={action.isPending || rating === m.rating} onPress={() => action.mutate({ action: 'rating', g: m.club_id, target: m.user_id, value: String(rating) })} />)}</View>
        </>}
      </View>)}
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 100, gap: 12, backgroundColor: theme.colors.background, flexGrow: 1 },
  heading: { color: theme.colors.text, fontSize: 24, fontWeight: '700', marginTop: 18 },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
  text: { color: theme.colors.text }, muted: { color: theme.colors.textSecondary }, error: { color: theme.colors.error },
  card: { padding: 16, gap: 10, borderRadius: 12, backgroundColor: theme.colors.surface },
  input: { color: theme.colors.text, backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, borderColor: theme.colors.textSecondary, borderWidth: 1 },
  button: { padding: 12, backgroundColor: theme.colors.primary, borderRadius: 8, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
