import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../../auth.jsx';
import { PageHead, Banner, Chip } from '../../components/ui.jsx';

// F2 – FR2.1: a charity sees its verification status and details.
export default function CharityOverview() {
  const { profile, refresh } = useAuth();
  useEffect(() => { refresh(); }, [refresh]); // pick up an admin decision made since sign-in

  if (!profile) return null;
  const rows = [['Registration no.', profile.regNo], ['Contact person', profile.contactPerson], ['Phone', profile.phone], ['Address', `${profile.address}, ${profile.area}`], ['Certificate', profile.document?.originalName], ['Daily fair-share limit', `${profile.dailyClaimLimit} packs`]];
  return (
    <>
      <PageHead title={profile.name} sub={<>Verification status: <Chip status={profile.status} /></>} owner="F2 · FR2.1 · Abisheak S" />
      {profile.status === 'approved' && <Banner kind="ok" title="Verified charity.">You can browse donations near you. Claiming opens in sprint 2.</Banner>}
      {profile.status === 'pending' && <Banner kind="info" title="Waiting for verification.">An administrator is checking your registration certificate. This usually takes about a day.</Banner>}
      {profile.status === 'rejected' && <Banner kind="warn" title="Registration not approved.">Reason: {profile.rejectionReason}. Contact FoodSave support to resubmit your certificate.</Banner>}
      <div className="grid split">
        <div className="card">
          <h2>Organisation details</h2>
          <table><tbody>{rows.map(([k, v]) => <tr key={k}><td className="sub" style={{ width: 200 }}>{k}</td><td><b>{v}</b></td></tr>)}</tbody></table>
        </div>
        <div className="card tint">
          <h2>Find donations</h2>
          <p>See free food from restaurants within 10 km of your home, sorted by time left.</p>
          <Link className="btn primary" to="/charity/donations">Donations near us</Link>
        </div>
      </div>
    </>
  );
}
