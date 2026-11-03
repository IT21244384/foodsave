import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead, Spinner, Empty, Banner } from '../components/ui.jsx';
import { fmtDateTime } from '../lib.js';

// Messages about a user's pickups and verification. Opening this page marks them as read.
export default function Notifications() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/notifications')
      .then((d) => {
        setItems(d.items);
        if (d.unread) return api('/notifications/read-all', { method: 'POST' }).then(() => window.dispatchEvent(new Event('foodsave:notifications')));
        return null;
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHead title="Notifications" sub="Updates about your pickups and your account." />
      {error && <Banner kind="warn">{error}</Banner>}
      <div className="card">
        {!items ? (error ? null : <Spinner />) : items.length === 0 ? <Empty title="Nothing new">You will see updates about your pickups here.</Empty> : (
          <ul className="notes">
            {items.map((n) => (
              <li key={n.id} className={n.readAt ? '' : 'unread'}>
                <b>{n.title}</b>
                <div>{n.body}</div>
                <div className="sub">{fmtDateTime(n.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
