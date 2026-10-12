import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { PageHead, TextInput, Select, Banner, Spinner } from '../../components/ui.jsx';
import { checkListing, inMinutes, toLocalInput } from '../../lib.js';
import StatusBanner from './StatusBanner.jsx';

const DIET = ['Veg', 'Non-veg', 'Halal', 'Contains nuts'];
const blank = () => ({ item: '', category: 'Cooked', dietTags: [], quantity: 10, originalPrice: '', price: '', offerType: 'sale', pickupFrom: inMinutes(20), pickupTo: inMinutes(80), safeUntil: inMinutes(170), hygieneDeclared: false });

// F1 – FR1.2 create/update a listing with FR1.3 validation (client + server).
export default function ListingEditor() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [v, setV] = useState(editing ? null : blank());
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api(`/listings/${id}`).then((l) => setV({
      item: l.item, category: l.category, dietTags: l.dietTags, quantity: l.quantity, originalPrice: l.originalPrice, price: l.offerType === 'donate' ? '' : l.price,
      offerType: l.offerType, pickupFrom: toLocalInput(l.pickupFrom), pickupTo: toLocalInput(l.pickupTo), safeUntil: toLocalInput(l.safeUntil), hygieneDeclared: l.hygieneDeclared,
    })).catch((e) => setMessage(e.message));
  }, [editing, id]);

  if (!v) return message ? <Banner kind="warn">{message}</Banner> : <Spinner />;
  // Editing a field clears its error straight away.
  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setErrors((er) => ({ ...er, [k]: undefined })); };
  const toggleDiet = (t) => setV({ ...v, dietTags: v.dietTags.includes(t) ? v.dietTags.filter((x) => x !== t) : [...v.dietTags, t] });
  const canPost = profile?.status === 'approved';

  async function submit(e) {
    e.preventDefault();
    const fieldErrors = checkListing(v);
    setErrors(fieldErrors);
    const n = Object.keys(fieldErrors).length;
    setMessage(n ? `Please fix ${n} issue${n > 1 ? 's' : ''} before publishing.` : '');
    if (n) return;
    setBusy(true);
    try {
      const body = {
        ...v, quantity: Number(v.quantity), originalPrice: Number(v.originalPrice), price: v.offerType === 'donate' ? 0 : Number(v.price),
        pickupFrom: new Date(v.pickupFrom).toISOString(), pickupTo: new Date(v.pickupTo).toISOString(), safeUntil: new Date(v.safeUntil).toISOString(),
      };
      await api(editing ? `/listings/${id}` : '/listings', { method: editing ? 'PUT' : 'POST', body });
      navigate('/restaurant/listings', { state: { notice: editing ? 'Listing updated.' : 'Listing published — nearby customers and charities can see it now.' } });
    } catch (err) {
      setErrors(err.fields);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title={editing ? 'Edit listing' : 'Post surplus food'} sub="Takes under a minute. Listings appear to nearby customers and charities straight away." owner="F1 · FR1.2, FR1.3 · Janahan R" />
      <StatusBanner profile={profile} />
      <div className="grid split">
        <form className="card" onSubmit={submit} noValidate>
          {message && <Banner kind="warn">{message}</Banner>}
          <div className="row">
            <TextInput label="Item name" value={v.item} error={errors.item} onChange={set('item')} placeholder="e.g. Vegetable fried rice" maxLength={80} />
            <Select label="Category" value={v.category} error={errors.category} onChange={set('category')} options={['Cooked', 'Bakery', 'Packaged']} className="narrow" />
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
            <legend className="f" style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 5 }}>Dietary tags</legend>
            <div className="checks">{DIET.map((t) => (
              <label key={t}><input type="checkbox" checked={v.dietTags.includes(t)} onChange={() => toggleDiet(t)} /> {t}</label>))}
            </div>
          </fieldset>
          <div className="field">
            <span className="f">Offer type</span>
            <div className="seg" role="group" aria-label="Offer type">
              <button type="button" aria-pressed={v.offerType === 'sale'} onClick={() => setV({ ...v, offerType: 'sale' })}>Sell at a discount</button>
              <button type="button" aria-pressed={v.offerType === 'donate'} onClick={() => setV({ ...v, offerType: 'donate' })}>Donate to charities</button>
            </div>
          </div>
          <div className="row">
            <TextInput label="Quantity (packs)" type="number" min="1" max="500" value={v.quantity} error={errors.quantity} onChange={set('quantity')} />
            <TextInput label="Original price (Rs)" type="number" min="0" value={v.originalPrice} error={errors.originalPrice} onChange={set('originalPrice')} />
            {v.offerType === 'sale' && <TextInput label="Discounted price (Rs)" type="number" min="1" value={v.price} error={errors.price} onChange={set('price')} />}
          </div>
          <div className="row">
            <TextInput label="Pickup from" type="datetime-local" value={v.pickupFrom} error={errors.pickupFrom} onChange={set('pickupFrom')} />
            <TextInput label="Pickup until" type="datetime-local" value={v.pickupTo} error={errors.pickupTo} onChange={set('pickupTo')} />
            <TextInput label="Safe to eat until" type="datetime-local" value={v.safeUntil} error={errors.safeUntil} onChange={set('safeUntil')} />
          </div>
          <div className="field">
            <label className="check"><input type="checkbox" checked={v.hygieneDeclared} onChange={(e) => { setV({ ...v, hygieneDeclared: e.target.checked }); setErrors((er) => ({ ...er, hygieneDeclared: undefined })); }} />
              I declare this food was prepared and stored hygienically and is safe until the time above (Food Act No. 26 of 1980).</label>
            {errors.hygieneDeclared && <div className="err" role="alert">{errors.hygieneDeclared}</div>}
          </div>
          <div className="row">
            <button className="btn primary" disabled={busy || !canPost}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish listing'}</button>
            <Link className="btn ghost" to="/restaurant/listings">Cancel</Link>
          </div>
        </form>
        <aside className="card tint">
          <h2>Validation rules (FR1.3)</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Safe-until must be after the pickup window ends.</li>
            <li>Cooked food: safe-until at most 6 hours from now.</li>
            <li>Discounted price must be lower than the original price.</li>
            <li>The hygiene declaration is required.</li>
          </ul>
          <h2 style={{ marginTop: 18 }}>What happens next</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>It appears in “near me” search for customers and charities.</li>
            <li>It stops showing once its safe-until time passes.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
