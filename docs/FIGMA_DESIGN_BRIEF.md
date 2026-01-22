# 🎨 Figma Design Brief: FootyFriends Mobile App

## 📱 Project Overview
**FootyFriends** is a React Native mobile application for organizing weekly 6-a-side football matches with a First-Come-First-Served (FCFS) signup system, automated team balancing, and push notifications.

**Target Platforms:** iOS & Android (Mobile-first design)  
**Design Style:** Modern, clean, sports-focused with green accent color (#10b981)

---

## 🎯 Design Requirements

### Color Palette
- **Primary Brand:** Green (#10b981) - Used for CTAs, success states, active elements
- **Background:** Light gray (#f9fafb) for app background
- **Card Background:** White (#ffffff) with subtle shadows
- **Text Primary:** Dark gray (#111827)
- **Text Secondary:** Medium gray (#6b7280)
- **Error/Destructive:** Red (#ef4444)
- **Info/Locked:** Blue (#3b82f6)
- **Warning/Waiting:** Yellow (#fef3c7)
- **Success/Open:** Light green (#d1fae5)

### Typography
- **App Title:** 36px, Bold
- **Screen Titles:** 24px, Bold
- **Card Titles:** 18-20px, Semi-bold
- **Body Text:** 16px, Regular
- **Labels:** 14px, Semi-bold
- **Captions:** 12-14px, Regular

### UI Components Style
- **Border Radius:** 8-12px for cards and buttons
- **Shadows:** Subtle elevation (iOS-style shadows)
- **Icons:** Use football/sports-themed icons where appropriate
- **Button States:** Design for normal, pressed, and disabled states

---

## 📲 Screens to Design

### 1. **Authentication Flow**

#### **Login Screen** (`login.tsx`)
- **Header Section:**
  - ⚽ FootyFriends logo/icon (large, centered)
  - Tagline: "Organize your weekly 6-a-side matches"
  
- **Form Section:**
  - Email input field with label
  - Password input field (toggleable visibility)
  - Toggle button to switch between "Magic Link" and "Password" modes
  
- **Actions:**
  - Primary CTA button: "Send Magic Link" or "Sign In"
  - Secondary link: "Or use magic link instead" / "Or sign in with password"
  - Helper text explaining magic link functionality

- **States to show:**
  - Default state
  - Loading state (disabled inputs, loading spinner)
  - Success state (for magic link sent)

---

### 2. **Main Tab Navigation**

Design a bottom tab bar with 3 main sections:

#### **Tab Bar Icons & Labels:**
1. **Matches** (List/Calendar icon) - Default active
2. **Admin** (Plus/Create icon) - Only for organizers
3. **Profile** (User/Person icon)

---

### 3. **Matches List Screen** (`matches.tsx`)

#### **Header:**
- Screen title: "Upcoming Matches"
- Pull-to-refresh indicator

#### **Match Cards (Multiple States):**

**Card Layout Elements:**
- Match date & time (large, prominent)
- Status badge (top-right corner):
  - "Waiting" (yellow background)
  - "Open" (green background)
  - "Locked" (blue background)
  - "Completed" (gray background)

- **Live Countdown Timer:**
  - "Opens in: 2d 5h" (for waiting matches)
  - "Kick-off in: 1h 23m" (for open matches)

- **Match Info:**
  - "18 spots • 3 teams"

- **Touch Target:** Entire card is tappable

#### **Empty State:**
- Illustration or icon
- "No upcoming matches"
- Consider adding a CTA if user is organizer

---

### 4. **Match Detail Screen** (`match/[id].tsx`)

#### **Header:**
- Back button (top-left)
- Match date/time (large title)
- Status badge (top-right)

#### **Info Card:**
Display in rows with label-value pairs:
- **Spots:** "12/18" (confirmed/total)
- **Waitlist:** "3"
- **Teams:** "3"

#### **User Status Card** (if signed up):
- Green background card
- "Your Status" label
- Status display:
  - "Confirmed ✓" (for confirmed players)
  - "Waitlist #3" (for waitlisted players)

#### **Action Buttons** (Context-dependent):
- **Join Match** (green button) - When match is open and user hasn't joined
- **Cancel Signup** (red button) - When user has signed up and match isn't locked
- **View Teams** (blue button) - When match is locked

#### **Button States:**
- Loading states: "Joining...", "Cancelling..."
- Disabled state styling

---

### 5. **Teams View Screen** (`teams/[id].tsx`)

#### **Header:**
- Back button
- Screen title: "Teams"

#### **Team Cards** (3 teams, typically):

**Card Header:**
- Team name (e.g., "Team A", "Team B", "Team C")
- Average rating badge: "⭐ 3.5"

**Player List:**
- Numbered list (1-6)
- Player rows with:
  - Number (left)
  - Display name (center, flex)
  - Rating value (right, green color)

**Card Footer:**
- Summary: "6 players • Total rating: 21"

#### **Visual Hierarchy:**
- Each team card should be clearly separated
- Use subtle background colors to distinguish players
- Highlight average rating prominently

---

### 6. **Admin/Create Match Screen** (`admin.tsx`)

#### **Header:**
- Screen title: "Create Match"

#### **Form Fields:**

**1. Match Kick-off:**
- Label: "Match Kick-off"
- Date/time picker UI
- Display format: "Dec 15, 2024, 7:00 PM"

**2. Sign-up Opens At:**
- Label: "Sign-up Opens At"
- Date/time picker UI
- Display format: "Dec 10, 2024, 10:00 AM"

#### **Info Box** (Light blue background):
- Bullet points:
  - "• 18 spots available"
  - "• 3 teams will be generated"

#### **CTA Button:**
- "Create Match" (green, full-width)
- Loading state: "Creating..."

#### **Non-organizer State:**
- Empty state message
- "Unable to set up organizer permissions"

---

### 7. **Profile Screen** (`profile.tsx`)

#### **Profile Section** (Top, centered):
- **Avatar Circle:**
  - Large (80px diameter)
  - Green background (#10b981)
  - Display first letter of name (white, 32px)

- **User Info:**
  - Display name (24px, bold)
  - Email address (16px, gray)

#### **Stats Section:**
- **Rating Card:**
  - White card with shadow
  - Large rating number (36px, green, bold): "4"
  - Label: "RATING" (14px, gray, uppercase)

#### **Actions:**
- **Sign Out Button:**
  - Red background (#ef4444)
  - Full-width
  - "Sign Out" text (white, 16px, semi-bold)

---

## 🔔 Special UI Elements

### **Countdown Timers:**
- Live updating (every second)
- Format: "2d 5h", "1h 23m", "45s"
- Green color (#10b981)
- Semi-bold weight
- Should feel dynamic and time-sensitive

### **Status Badges:**
- Pill-shaped (high border radius)
- Small padding
- Bold, uppercase or capitalized text
- Color-coded backgrounds:
  - Waiting: Yellow (#fef3c7)
  - Open: Light green (#d1fae5)
  - Locked: Light blue (#dbeafe)
  - Completed: Gray (#e5e7eb)

### **Pull-to-Refresh:**
- Standard iOS/Android patterns
- Subtle spinner animation

---

## 📐 Layout Guidelines

### **Spacing:**
- Screen padding: 16-24px
- Card gaps: 12-16px
- Internal card padding: 16px
- Form field gaps: 16-20px

### **Touch Targets:**
- Minimum 44x44pt for iOS, 48x48dp for Android
- Buttons should have comfortable tap areas
- List items should be easy to tap

### **Responsive Considerations:**
- Design for iPhone SE (smallest) and iPhone 14 Pro Max (largest)
- Consider Android devices with various aspect ratios
- Safe area insets for notched devices

---

## ✨ Micro-interactions to Consider

1. **Button Press:** Scale down slightly on press
2. **Card Tap:** Subtle highlight or scale
3. **Loading States:** Spinner animations
4. **Pull-to-Refresh:** Smooth animation
5. **Status Transitions:** Badge color changes
6. **Countdown Updates:** Smooth number transitions

---

## 🎭 Additional Screens/States to Design

### **Modal/Alert States:**
1. **Email Sent Confirmation:** "Check your email - We sent you a magic link..."
2. **Cancel Signup Confirmation:** "Are you sure you want to cancel?"
3. **Sign Out Confirmation:** "Are you sure you want to sign out?"
4. **Error Alerts:** Generic error state design

### **Loading States:**
- Full-screen loading (initial app load)
- Skeleton screens for lists
- Button loading states
- Pull-to-refresh indicator

### **Empty States:**
- No upcoming matches
- Teams not generated yet
- No profile data

---

## 🏅 Branding Elements

- **App Icon:** Should feature ⚽ football/soccer theme with green accent
- **Splash Screen:** FootyFriends branding with app icon
- **Typography:** Clean, modern sans-serif (SF Pro for iOS, Roboto for Android)
- **Imagery:** Consider adding subtle football field patterns or textures as background elements

---

## 📦 Deliverables

### **Figma File Structure:**
1. **Cover Page** with app overview
2. **Design System Page:**
   - Color palette
   - Typography scale
   - Component library (buttons, cards, inputs, badges)
3. **Screen Flows:**
   - Authentication flow (2 screens)
   - Main app flow (5 main screens)
   - Modal/alert variations
4. **Component States:**
   - All interactive elements with hover, pressed, disabled states
5. **Responsive Frames:**
   - Design for at least 2 device sizes (small & large)
6. **Prototype:**
   - Interactive prototype showing main user journeys:
     - Login → View matches → Join match → View teams
     - Admin: Create match flow

---

## 🎯 Priority User Flows

1. **New User Login:** Login screen → Magic link sent → Matches list
2. **Join Match:** Matches list → Match detail → Join → See confirmation
3. **View Teams:** Match detail (locked) → View teams
4. **Create Match (Admin):** Admin tab → Fill form → Create → Success
5. **Profile Management:** Profile tab → View stats → Sign out

---

## 💡 Design Tips

- **Keep it football/sports-focused:** Use relevant iconography and terminology
- **Emphasize real-time elements:** Countdowns and live status updates are key features
- **Clear hierarchy:** Users need to quickly see match status and their signup status
- **Mobile-first:** Design for thumb-friendly interactions
- **Accessibility:** Ensure sufficient color contrast and readable text sizes
- **Trust signals:** Clear status indicators help users feel confident about their signups

---

## 📊 Key Features Summary

### **Authentication:**
- Magic link (passwordless) authentication
- Email/password login option
- Deep linking support

### **Match Management:**
- FCFS signup system (First 18 players confirmed)
- Waitlist management with queue positions
- Automatic promotion from waitlist on cancellations
- Real-time countdown timers
- Match status tracking (waiting, open, locked, completed)

### **Team Generation:**
- Automatic team balancing at T-60 minutes before kickoff
- 3 teams of 6 players each
- Player ratings (1-5 scale)
- Serpentine draft algorithm for fair teams

### **User Features:**
- Player profiles with ratings
- Match signup/cancellation
- Team view after lock
- Push notifications for key events

### **Admin Features:**
- Match creation with custom dates/times
- Automatic club creation for organizers
- Audit logging

---

## 🎨 Component Library to Create

### **Buttons:**
1. **Primary Button** (Green)
   - Default, Pressed, Disabled states
   - Full-width and auto-width variants

2. **Destructive Button** (Red)
   - Default, Pressed, Disabled states
   - Used for cancel/delete actions

3. **Info Button** (Blue)
   - Default, Pressed states
   - Used for view/info actions

4. **Link Button** (Text only)
   - Default, Pressed states
   - Used for secondary actions

### **Cards:**
1. **Match Card**
   - Multiple status badge variants
   - Countdown timer component
   - Touch feedback

2. **Info Card**
   - Row-based layout
   - Label-value pairs

3. **Team Card**
   - Header with team name and rating
   - Player list
   - Footer summary

4. **Status Card**
   - User signup status
   - Highlighted state

### **Inputs:**
1. **Text Input**
   - Default, Focus, Error states
   - Email and password variants
   - Labels and placeholders

2. **Date/Time Picker**
   - Native iOS/Android styles
   - Display format

### **Badges:**
1. **Status Badges**
   - Waiting (Yellow)
   - Open (Green)
   - Locked (Blue)
   - Completed (Gray)

2. **Rating Badge**
   - Star icon + number

### **Navigation:**
1. **Tab Bar**
   - Active/Inactive states
   - Icons + labels
   - Safe area consideration

2. **Header Bar**
   - Back button
   - Title
   - Optional action buttons

### **Feedback Elements:**
1. **Loading Spinner**
   - Full screen variant
   - Inline variant

2. **Pull-to-Refresh**
   - iOS/Android native styles

3. **Alerts/Modals**
   - Success, Error, Warning, Info types
   - Action buttons

4. **Empty States**
   - Icon/illustration
   - Message text
   - Optional CTA

---

## 📱 Screen Dimensions Reference

### **iOS Devices:**
- iPhone SE (3rd gen): 375 x 667 pt
- iPhone 14/15: 390 x 844 pt
- iPhone 14/15 Pro Max: 430 x 932 pt

### **Android Reference:**
- Small: 360 x 640 dp
- Medium: 360 x 800 dp
- Large: 412 x 915 dp

### **Safe Areas:**
- Top safe area: ~44-59pt (iOS with notch)
- Bottom safe area: ~34pt (iOS home indicator)
- Tab bar height: ~49-83pt (depends on safe area)

---

## 🔄 Real-time Features to Emphasize

1. **Live Countdowns:**
   - Prominent placement
   - Green accent color
   - Updates every second
   - Clear time format

2. **Match Status Changes:**
   - Visual status badges
   - Clear transitions
   - Color-coded states

3. **Signup Updates:**
   - Immediate feedback on join/cancel
   - Queue position updates
   - Spot availability changes

4. **Pull-to-Refresh:**
   - Standard native patterns
   - Smooth animations
   - Clear loading indicators

---

## 🎯 Accessibility Considerations

### **Color Contrast:**
- All text should meet WCAG AA standards (4.5:1 for normal text)
- Status badges should be distinguishable beyond color (use text/icons)

### **Touch Targets:**
- Minimum 44x44pt tap targets
- Adequate spacing between interactive elements

### **Text Sizing:**
- Support Dynamic Type (iOS)
- Support font scaling (Android)
- Test at 1.5x and 2x scale

### **Screen Readers:**
- All interactive elements should have clear labels
- Status information should be announced
- Consider how countdown timers are read

---

## 📝 Design Notes

### **Match Cards:**
- The most frequently viewed component
- Should be scannable at a glance
- Countdown timers are a key differentiator
- Status badges provide immediate context

### **Match Detail:**
- Clear call-to-action placement
- User status should be highly visible
- Info organization supports quick decisions

### **Teams View:**
- Balanced visual weight for all teams
- Easy to find yourself in the list
- Rating information builds trust in balancing

### **Admin Flow:**
- Simple, focused form
- Clear validation feedback
- Success confirmation important

### **Profile:**
- Simple, clean design
- Rating is the key metric
- Sign out should be accessible but not too prominent

---

## 🚀 Future Features to Consider

While not currently implemented, consider designing for:

1. **Match History:**
   - Past matches list
   - Historical stats

2. **Player Voting:**
   - Post-match rating of teammates
   - Star-based system

3. **No-Show Tracking:**
   - Visual indicators for reliability

4. **Settings:**
   - Notification preferences
   - Language selection (EN/RO)
   - Profile editing

5. **Onboarding:**
   - First-time user flow
   - Feature highlights

---

## ✅ Design Checklist

Before finalizing the design, ensure:

- [ ] All screens have light/dark mode variants (if applicable)
- [ ] Loading states designed for all async actions
- [ ] Error states designed for all failure scenarios
- [ ] Empty states designed for all lists/collections
- [ ] All button states designed (normal, pressed, disabled)
- [ ] All input states designed (default, focus, error, disabled)
- [ ] Safe area insets considered for all screens
- [ ] Touch targets meet minimum size requirements
- [ ] Color contrast meets accessibility standards
- [ ] Typography scales appropriately
- [ ] Component library is comprehensive
- [ ] Prototype demonstrates key user flows
- [ ] Design is responsive across device sizes
- [ ] Micro-interactions are documented
- [ ] Icon set is consistent and complete

---

## 🎨 Final Thoughts

FootyFriends is a time-sensitive, action-oriented app where users need to quickly:
1. See upcoming matches
2. Check countdown timers
3. Understand their signup status
4. Join or cancel participation
5. View their teams

The design should prioritize:
- **Speed**: Quick loading and easy scanning
- **Clarity**: Obvious status and actions
- **Trust**: Clear feedback and state management
- **Delight**: Smooth animations and polished details

Keep the football theme present but not overwhelming. The app should feel professional, reliable, and modern while maintaining a friendly, community-focused atmosphere.

---

**Built with ⚽ for organizing awesome football matches!**

