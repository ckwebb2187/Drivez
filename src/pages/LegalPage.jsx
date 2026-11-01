import { Link, useLocation } from 'react-router-dom';

// Public Privacy Policy, Terms and account-deletion pages (linked from Google Play).
// Plain language. Keep in step with what the app actually collects.
const UPDATED = 'November 1, 2026';

const H = ({ children }) => <h2 className="text-lg font-bold text-foreground mt-6 mb-2">{children}</h2>;
const P = ({ children }) => <p className="text-sm text-muted-foreground leading-relaxed mb-2">{children}</p>;
const L = ({ items }) => <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mb-2">{items.map((t) => <li key={t}>{t}</li>)}</ul>;

function Privacy() {
  return (
    <>
      <P>Kaido Maps is a driving app for car enthusiasts. This page explains what we collect, why, and who it goes to. We don't sell your data and we don't show ads.</P>
      <H>What we collect</H>
      <L items={[
        'Account: your name, email, username, and password (stored scrambled), or your Google sign-in if you use it.',
        'Profile and garage: photos, car details, mods, socials and anything else you choose to add.',
        'Location: while the app is open and you plan or record a drive. Saved drives keep the route, speed, corners and times.',
        'Shared location: only if you turn it on, your live position goes to friends, group drives, your family group, or (delayed, never near your home zone) Spotted mode.',
        'Family groups: location, battery level, check-ins, SOS and driving alerts are shared with the other members of your family.',
        'Microphone: only when you hold the button to talk (voice questions or group push-to-talk).',
        'Bluetooth (Android app): the name of your car\'s Bluetooth connection, so miles count to the right car.',
        'Now playing (Android app): if you allow it, the song and app playing on your phone, to show music controls. This never leaves your phone.',
        'Things you post: meets, photos, feed posts, road reports, ideas and problem reports (problem reports include basic phone info).',
      ]} />
      <H>Services that help run the app</H>
      <P>To work, the app sends some data to these services. They get only what they need for that job.</P>
      <L items={[
        'Cloudflare: hosts the app and stores your account and drives.',
        'Google Gemini (adult accounts only): voice questions, drive narration and the natural voice. It gets your question (typed or the voice recording) plus your current location, speed, road, destination and car, so it can answer. Google may use this to improve its services.',
        'Routing, search and maps (OpenStreetMap-based services such as OSRM, Valhalla, Nominatim, Photon, Overpass, OpenFreeMap; and the US Census address lookup): your search text and route points.',
        'Traffic (TomTom) and weather (Open-Meteo, National Weather Service, RainViewer, AccuWeather): points along your route or map area.',
        'Discord: only if a group drive is linked to a Discord channel.',
        'ListenBrainz: only if you enter your ListenBrainz username to show what you\'re listening to.',
        'Email (Resend): password reset emails.',
      ]} />
      <H>Who can see your stuff</H>
      <P>You choose. Your profile has per-part visibility settings, ghost mode hides you from the live map, and teen accounts in a family follow the limits their parent sets.</P>
      <H>Keeping and deleting data</H>
      <P>Your data stays until you delete it. You can set old drives to delete themselves, download everything, or delete your account (Settings → Privacy & data). Deleting your account removes your profile, drives, photos, location history, friends, family membership and posts. See <Link to="/delete-account" className="text-primary underline">how to delete your account</Link>.</P>
      <H>Kids and teens</H>
      <P>You must be 13 or older to sign up. Teens (13-17) can be linked to a parent's family group, where the parent controls meets, social features, map visibility and group drives. Gemini features are off for teen accounts. If you think a child under 13 has signed up, report it from the app and we'll delete the account.</P>
      <H>Security</H>
      <P>Everything is sent over encrypted connections (HTTPS). Passwords are never stored in plain text.</P>
      <H>Changes and contact</H>
      <P>If this policy changes we'll update the date above and tell you in the app for big changes. Questions or requests: use Report a problem in the app (menu → Ideas & help).</P>
    </>
  );
}

function Terms() {
  return (
    <>
      <P>By using Kaido Maps you agree to these terms. If you don't agree, please don't use the app.</P>
      <H>Drive safely and legally</H>
      <L items={[
        'Always obey traffic laws, speed limits and road signs. You are responsible for how you drive.',
        "Don't use the app in a way that takes your attention off the road. Set things up before you drive or let a passenger do it. Many controls are locked while the car is moving.",
        'Kaido Maps is not for racing on public roads. Drive modes, scores and times are for fun and for track days or closed courses where allowed. Scores reward smoothness, not speed.',
        'Directions, speed limits, traffic, weather, hazards and arrival times can be wrong or out of date. Use your own judgment and follow real road signs.',
      ]} />
      <H>Your account</H>
      <P>You must be 13 or older. Keep your password private. You're responsible for what you post. Don't post anything illegal, hateful, harassing, sexual, or anyone else's private info, and don't share someone's location without their OK. We may remove content or accounts that break these rules.</P>
      <H>Your content</H>
      <P>You own what you post. You let us store and show it in the app so it works (for example, showing your meet photos to people going to that meet).</P>
      <H>No warranty</H>
      <P>The app is provided "as is". We don't promise it will always work, be accurate, or be available. To the extent the law allows, we aren't liable for any loss, damage, injury, ticket or fine that comes from using the app.</P>
      <H>Changes</H>
      <P>We may update these terms. We'll change the date above and let you know in the app for big changes. Continuing to use the app means you accept the new terms.</P>
      <P>See also the <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>.</P>
    </>
  );
}

function DeleteAccount() {
  return (
    <>
      <P>You can delete your Kaido Maps account and its data at any time.</P>
      <H>In the app</H>
      <L items={[
        'Open Kaido Maps and sign in.',
        'Open Settings → Privacy & data.',
        'Tap Delete my account, type DELETE, and confirm.',
      ]} />
      <P><Link to="/login" className="text-primary underline">Sign in to delete your account now</Link>.</P>
      <H>What gets deleted</H>
      <P>Your profile, garage and car photos, saved drives and location history, friends, family membership, Spotted mode history, road reports and posts. This happens right away and can't be undone.</P>
      <H>Can't sign in?</H>
      <P>Reset your password from the sign-in page, then follow the steps above. If that doesn't work, send a request with Report a problem from any signed-in account, or contact the developer through the Google Play listing, and include the email on the account.</P>
    </>
  );
}

const PAGES = {
  '/privacy': ['Privacy Policy', Privacy],
  '/terms': ['Terms of Use', Terms],
  '/delete-account': ['Delete your account', DeleteAccount],
};

export default function LegalPage() {
  const { pathname } = useLocation();
  const [title, Body] = PAGES[pathname] || PAGES['/privacy'];
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <img src="/logo.png" alt="" className="w-10 h-10 rounded-xl" />
          <span className="font-bold text-foreground">Kaido Maps</span>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground mb-4">Last updated {UPDATED}</p>
        <Body />
        <div className="flex gap-4 text-xs text-muted-foreground mt-8 border-t border-border pt-4">
          <Link to="/privacy" className="underline">Privacy</Link>
          <Link to="/terms" className="underline">Terms</Link>
          <Link to="/delete-account" className="underline">Delete account</Link>
        </div>
      </div>
    </div>
  );
}
