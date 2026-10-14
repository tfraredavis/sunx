import { useState } from 'react';
import { submitLead } from '../lib/submitLead.js';

/**
 * Contact form for the free solar savings report.
 * All four fields required. On a valid submit nothing visible happens (passive for now);
 * the payload is handed to submitLead(), which will later email the consultant.
 */
export default function LeadForm({ initialAddress, design }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: initialAddress || '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="card lead-form"
      onSubmit={(e) => {
        e.preventDefault();
        submitLead({ contact: { ...form }, design });
      }}
    >
      <label className="field">
        <span>Name</span>
        <input type="text" autoComplete="name" required value={form.name} onChange={set('name')} />
      </label>
      <label className="field">
        <span>Email Address</span>
        <input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
      </label>
      <label className="field">
        <span>Phone</span>
        <input
          type="tel"
          autoComplete="tel"
          required
          pattern="[0-9\(\)\+\-\.\s]{7,}"
          title="Enter a valid phone number"
          value={form.phone}
          onChange={set('phone')}
        />
      </label>
      <label className="field">
        <span>Home Address</span>
        <input type="text" autoComplete="street-address" required value={form.address} onChange={set('address')} />
      </label>
      <button type="submit" className="btn btn-primary">
        Submit
      </button>
    </form>
  );
}
