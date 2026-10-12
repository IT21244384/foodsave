import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui.jsx';

// FR1.1: tells the restaurant whether it can post yet.
export default function StatusBanner({ profile }) {
  if (!profile) return null;
  if (profile.status === 'approved') return null;
  if (profile.status === 'rejected') {
    return (
      <Banner kind="warn" title="Verification was not approved.">
        Reason: {profile.rejectionReason || 'not given'}. <Link to="/restaurant/profile">Update your profile</Link> to send it for review again.
      </Banner>
    );
  }
  return <Banner kind="info" title="Waiting for verification.">An administrator is checking your restaurant. You can post surplus as soon as it is approved.</Banner>;
}
