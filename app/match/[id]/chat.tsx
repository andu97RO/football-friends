import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface ChatMessage {
  id: string;
  match_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    display_name: string;
  };
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Fetch messages
  const { data: messages, isLoading } = useQuery({
    queryKey: ['chat', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_message')
        .select('*, profile(display_name)')
        .eq('match_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ChatMessage[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_message',
          filter: `match_id=eq.${id}`,
        },
        async (payload) => {
          // Fetch the profile for the new message
          const { data: profile } = await supabase
            .from('profile')
            .select('display_name')
            .eq('user_id', payload.new.user_id)
            .single();

          const newMsg = { ...payload.new, profile } as ChatMessage;

          queryClient.setQueryData(['chat', id], (old: ChatMessage[] = []) => {
             // Avoid duplicates - check both by ID and by temp ID
             if (old.find(m => m.id === newMsg.id)) return old;

             // Remove optimistic message and add real one
             // Check if this message was sent by the current user around the same time
             const filteredOld = old.filter(m => {
               // Keep messages that don't match this new message
               if (!m.id.startsWith('temp-')) return true;
               if (m.user_id !== newMsg.user_id) return true;
               if (m.content !== newMsg.content) return true;
               // This is likely the optimistic version of our new message
               return false;
             });

             return [...filteredOld, newMsg];
          });

          // Scroll to bottom
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!content.trim()) return;
      
      const { error } = await supabase.from('chat_message').insert({
        match_id: id as string,
        user_id: session!.user!.id,
        content: content.trim(),
      });

      if (error) throw error;
    },
    onMutate: async (content) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['chat', id] });
      const previousMessages = queryClient.getQueryData(['chat', id]);

      const optimisticMessage: ChatMessage = {
        id: 'temp-' + Date.now(),
        match_id: id as string,
        user_id: session!.user!.id,
        content: content.trim(),
        created_at: new Date().toISOString(),
        profile: {
          display_name: 'You', // Placeholder until real data comes
        },
      };

      queryClient.setQueryData(['chat', id], (old: ChatMessage[] = []) => [...old, optimisticMessage]);
      setNewMessage('');
      
      return { previousMessages };
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['chat', id], context?.previousMessages);
      Alert.alert('Error', 'Failed to send message');
    },
  });

  const handleSend = () => {
    if (!newMessage.trim()) return;
    sendMessageMutation.mutate(newMessage);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.user_id === session?.user?.id;

    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessageContainer : styles.theirMessageContainer]}>
        <Text style={[styles.senderName, isMe && styles.mySenderName]}>
          {isMe ? 'You' : (item.profile?.display_name || 'Unknown')}
        </Text>
        <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
          <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.theirTimeText]}>
            {dayjs(item.created_at).format('h:mm A')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.background, '#1e1b4b']}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match Chat</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <BlurView intensity={20} tint="dark" style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={theme.colors.textSecondary}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]} 
            onPress={handleSend}
            disabled={!newMessage.trim()}
          >
            <Ionicons name="send" size={20} color="white" />
          </TouchableOpacity>
        </BlurView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.l,
    paddingTop: 60,
    paddingBottom: theme.spacing.m,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  listContent: {
    padding: theme.spacing.m,
    paddingBottom: 20,
  },
  messageContainer: {
    marginBottom: theme.spacing.m,
    maxWidth: '80%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
  },
  theirMessageContainer: {
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.primaryLight,
    marginBottom: 4,
  },
  mySenderName: {
    color: theme.colors.text,
    textAlign: 'right',
  },
  bubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '100%',
  },
  myBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  myMessageText: {
    color: 'white',
  },
  theirMessageText: {
    color: theme.colors.text,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myTimeText: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  theirTimeText: {
    color: theme.colors.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 16,
    maxHeight: 100,
    marginRight: theme.spacing.m,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
