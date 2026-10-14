import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { callFunction } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, useLocaleStore, useT } from '@/lib/i18n';
import { showToast } from '@/lib/toast';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader, Txt } from '@/components/ui';

interface ChatMessage {
  id: string;
  match_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: { display_name: string } | null;
  pending?: boolean;
}

type Item = { kind: 'day'; key: string; label: string } | { kind: 'message'; key: string; message: ChatMessage; showName: boolean };

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const insets = useSafeAreaInsets();
  const session = useAuthStore((s) => s.session);
  const myId = session?.user.id;
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<Item>>(null);
  const key = ['chat', id, myId];

  const header = useQuery({
    queryKey: ['chat-header', id, myId],
    queryFn: async () => {
      const [{ data: allowed, error }, { data: match }, { count }] = await Promise.all([
        supabase.rpc('can_access_chat', { m: id }),
        supabase.from('match').select('kick_off').eq('id', id).maybeSingle(),
        supabase.from('signup').select('id', { count: 'exact', head: true }).eq('match_id', id).eq('state', 'confirmed'),
      ]);
      if (error) throw error;
      return { allowed: allowed === true, kickOff: match?.kick_off as string | undefined, players: count ?? 0 };
    },
  });

  const messages = useQuery({
    queryKey: key,
    enabled: header.data?.allowed === true,
    queryFn: async () => {
      const { data, error } = await supabase.from('chat_message').select('*, profile(display_name)').eq('match_id', id).order('created_at');
      if (error) throw error;
      return data as ChatMessage[];
    },
  });

  useEffect(() => {
    if (!header.data?.allowed) return;
    const channel = supabase
      .channel(`chat:${id}:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message', filter: `match_id=eq.${id}` }, async (payload) => {
        const { data: profile } = await supabase.from('profile').select('display_name').eq('user_id', payload.new.user_id).maybeSingle();
        const incoming = { ...payload.new, profile } as ChatMessage;
        client.setQueryData<ChatMessage[]>(key, (old = []) => {
          if (old.some((m) => m.id === incoming.id)) return old;
          const withoutEcho = old.filter((m) => !(m.pending && m.user_id === incoming.user_id && m.content === incoming.content));
          return [...withoutEcho, incoming];
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, myId, header.data?.allowed, client]);

  const send = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from('chat_message').insert({ match_id: id, user_id: myId, content });
      if (error) throw error;
      // Chat pushes respect each player's "Chat" notification setting.
      callFunction('notify-chat', { matchId: id, content }).catch(() => undefined);
    },
    onMutate: async (content) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ChatMessage[]>(key);
      client.setQueryData<ChatMessage[]>(key, (old = []) => [
        ...old,
        { id: `temp-${Date.now()}`, match_id: id, user_id: myId!, content, created_at: new Date().toISOString(), pending: true },
      ]);
      setDraft('');
      return { previous, content };
    },
    onError: (_error, _content, context) => {
      client.setQueryData(key, context?.previous);
      setDraft(context?.content ?? '');
      showToast(t('chat.sendFailed'), { tone: 'error' });
    },
  });

  const title = <ScreenHeader back title={t('match.chat')} titleVariant="title" subtitle={header.data?.kickOff ? t('chat.subtitle', { when: formatDate.day(header.data.kickOff, locale), count: header.data.players }) : undefined} />;

  if (header.isLoading) return <Screen header={title}><LoadingState /></Screen>;
  if (header.error) return <Screen header={title}><ErrorState error={header.error} onRetry={() => header.refetch()} /></Screen>;
  if (!header.data?.allowed) {
    return <Screen header={title}><EmptyState icon="lock-closed-outline" title={t('chat.membersOnly')} body={t('chat.membersOnlyBody')} /></Screen>;
  }

  // Day separators; the sender's name only at the start of their run (T6).
  const items: Item[] = [];
  let lastDay = '';
  let lastSender = '';
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  for (const message of messages.data ?? []) {
    const day = dayKey(message.created_at);
    if (day !== lastDay) {
      items.push({ kind: 'day', key: `day-${day}`, label: day === today ? t('chat.today') : day === yesterday ? t('chat.yesterday') : formatDate.day(message.created_at, locale) });
      lastDay = day;
      lastSender = '';
    }
    items.push({ kind: 'message', key: message.id, message, showName: message.user_id !== myId && message.user_id !== lastSender });
    lastSender = message.user_id;
  }

  const submit = () => {
    const content = draft.trim();
    if (content) send.mutate(content);
  };

  return (
    <Screen header={title} scroll={false} testID="chat-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 60}>
        {messages.isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState icon="chatbubbles-outline" title={t('chat.emptyTitle')} body={t('chat.emptyBody')} />
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <Txt variant="label" tone="muted" style={styles.day}>{item.label}</Txt>
              ) : (
                <Bubble message={item.message} mine={item.message.user_id === myId} showName={item.showName} locale={locale} />
              )
            }
          />
        )}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={theme.colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={4000}
            accessibilityLabel={t('chat.placeholder')}
            testID="chat-input"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            onPress={submit}
            disabled={!draft.trim()}
            style={[styles.send, !draft.trim() && { opacity: 0.4 }]}
            testID="chat-send"
          >
            <Ionicons name="send" size={18} color={theme.colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Alignment says who sent it; my bubbles use a tint, not the primary-button lime. */
function Bubble({ message, mine, showName, locale }: { message: ChatMessage; mine: boolean; showName: boolean; locale: 'en' | 'ro' }) {
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {showName && <Txt variant="caption" tone="secondary" style={styles.name}>{message.profile?.display_name ?? '?'}</Txt>}
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs, message.pending && { opacity: 0.6 }]}>
        <Txt variant="body">{message.content}</Txt>
        <Txt variant="caption" tone="muted" style={styles.time}>{formatDate.time(message.created_at, locale)}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: theme.spacing.m + 4, paddingVertical: theme.spacing.m, gap: 6 },
  day: { alignSelf: 'center', marginVertical: 10 },
  row: { maxWidth: '82%', gap: 3 },
  rowMine: { alignSelf: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  name: { marginLeft: 4, fontFamily: theme.fonts.bold },
  bubble: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 6, borderRadius: 18, borderWidth: 1 },
  mine: { backgroundColor: theme.colors.primaryTint, borderColor: 'rgba(200, 240, 74, 0.35)', borderBottomRightRadius: 6 },
  theirs: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderBottomLeftRadius: 6 },
  time: { fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: theme.spacing.m, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background,
  },
  input: {
    flex: 1, minHeight: 48, maxHeight: 120, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 13, borderRadius: 24,
    backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border,
    color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: 16,
  },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
});
