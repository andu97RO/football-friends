import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function AdminScreen() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const [kickOffDate, setKickOffDate] = useState('');
  const [kickOffTime, setKickOffTime] = useState('');
  const [openTime, setOpenTime] = useState('');

  // Check if user is organizer
  const { data: isOrganizer } = useQuery({
    queryKey: ['isOrganizer', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return false;

      const { data, error } = await supabase
        .from('club')
        .select('id')
        .eq('organizer_id', session.user.id)
        .single();

      return !error && !!data;
    },
    enabled: !!session?.user?.id,
  });

  const createMatchMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error('Not authenticated');

      // Get or create club
      let { data: club, error: clubError } = await supabase
        .from('club')
        .select('id')
        .eq('organizer_id', session.user.id)
        .single();

      if (clubError || !club) {
        const { data: newClub, error: createError } = await supabase
          .from('club')
          .insert({
            name: 'My Football Club',
            organizer_id: session.user.id,
          })
          .select()
          .single();

        if (createError) throw createError;
        club = newClub;
      }

      // Parse dates
      const kickOff = new Date(`${kickOffDate}T${kickOffTime}`);
      const signupOpen = new Date(`${kickOffDate}T${openTime}`);

      // Create match
      const { data, error } = await supabase
        .from('match')
        .insert({
          club_id: club.id,
          kick_off: kickOff.toISOString(),
          signup_open_at: signupOpen.toISOString(),
          spots: 18,
          teams_count: 3,
          status: 'scheduled',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      Alert.alert('Success', 'Match created successfully');
      setKickOffDate('');
      setKickOffTime('');
      setOpenTime('');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message);
    },
  });

  if (!isOrganizer) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>You don't have organizer permissions</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Create Match</Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Kick-off Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="2025-11-20"
              value={kickOffDate}
              onChangeText={setKickOffDate}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Kick-off Time (HH:MM)</Text>
            <TextInput
              style={styles.input}
              placeholder="19:00"
              value={kickOffTime}
              onChangeText={setKickOffTime}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Sign-up Opens At (HH:MM)</Text>
            <TextInput
              style={styles.input}
              placeholder="12:00"
              value={openTime}
              onChangeText={setOpenTime}
            />
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={() => createMatchMutation.mutate()}
            disabled={createMatchMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {createMatchMutation.isPending ? 'Creating...' : 'Create Match'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    color: '#6b7280',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
