async function request(path, options) {
  const response = await fetch(`/api${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export const api = {
  terms: () => request("/terms"),
  subjects: (term) => request(`/terms/${term}/subjects`),
  sections: (term, subject) => request(`/terms/${term}/sections?subject=${encodeURIComponent(subject)}`),
  schedules: (term, payload) =>
    request(`/terms/${term}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  plans: (term, plans) =>
    request(`/terms/${term}/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plans }),
    }),
};
