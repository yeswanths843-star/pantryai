// ============================================================
// js/pantry.js
// Owns pantry state: load/save to localStorage, CRUD operations,
// and rendering the pantry grid. Fires a "pantry:changed" event
// on document whenever the pantry data changes, so other modules
// (chat.js) can react without being tightly coupled to this one.
// ============================================================

const Pantry = (() => {
  const STORAGE_KEY = "smartpantry_items_v1";
  let items = [];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      items = raw ? JSON.parse(raw) : seedData();
    } catch (err) {
      console.error("Failed to load pantry from storage:", err);
      items = seedData();
    }
    save(false);
  }

  function seedData() {
    return [
      { id: cryptoId(), name: "Milk", quantity: "2", category: "Dairy", expiry: addDays(5) },
      { id: cryptoId(), name: "Rice", quantity: "5kg", category: "Grains", expiry: addDays(180) },
      { id: cryptoId(), name: "Spinach", quantity: "1 bunch", category: "Produce", expiry: addDays(3) },
      { id: cryptoId(), name: "Eggs", quantity: "12", category: "Protein", expiry: addDays(10) },
    ];
  }

  function addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function cryptoId() {
    return (crypto.randomUUID && crypto.randomUUID()) || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function save(notify = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (notify) {
      document.dispatchEvent(new CustomEvent("pantry:changed", { detail: getAll() }));
    }
  }

  function getAll() {
    return [...items];
  }

  function getById(id) {
    return items.find((i) => i.id === id);
  }

  function addItem({ name, quantity, category, expiry }) {
    items.push({ id: cryptoId(), name, quantity, category, expiry });
    save();
  }

  function updateItem(id, updates) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    items[idx] = { ...items[idx], ...updates };
    save();
  }

  function deleteItem(id) {
    items = items.filter((i) => i.id !== id);
    save();
  }

  function daysUntil(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
  }

  function expiryState(dateStr) {
    const days = daysUntil(dateStr);
    if (days < 0) return "expired";
    if (days <= 3) return "expiring";
    return "ok";
  }

  function expiryLabel(dateStr) {
    const days = daysUntil(dateStr);
    if (days < 0) return `Expired ${Math.abs(days)}d ago`;
    if (days === 0) return "Expires today";
    if (days === 1) return "Expires tomorrow";
    return `Expires in ${days}d`;
  }

  // ---------- Rendering ----------
  function render() {
    const grid = document.getElementById("pantryGrid");
    const empty = document.getElementById("pantryEmpty");
    const search = document.getElementById("pantrySearch").value.trim().toLowerCase();
    const filter = document.getElementById("pantryFilter").value;

    const visible = items
      .filter((i) => (filter === "all" ? true : i.category === filter))
      .filter((i) => i.name.toLowerCase().includes(search))
      .sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry));

    grid.innerHTML = "";
    empty.hidden = visible.length !== 0;

    visible.forEach((item) => {
      const state = expiryState(item.expiry);
      const card = document.createElement("div");
      card.className = `pantry-card ${state === "expiring" ? "is-expiring" : ""} ${state === "expired" ? "is-expired" : ""}`;
      card.innerHTML = `
        <div class="pantry-card__actions">
          <button data-action="edit" title="Edit">✎</button>
          <button data-action="delete" title="Delete">🗑</button>
        </div>
        <span class="pantry-card__tag">${escapeHtml(item.category)}</span>
        <h3 class="pantry-card__name">${escapeHtml(item.name)}</h3>
        <p class="pantry-card__meta">Qty: ${escapeHtml(item.quantity)}</p>
        <p class="pantry-card__expiry ${state === "expiring" ? "is-expiring" : ""} ${state === "expired" ? "is-expired" : ""}">
          ${expiryLabel(item.expiry)}
        </p>
      `;
      card.querySelector('[data-action="edit"]').addEventListener("click", () => window.App.openEditItem(item.id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => {
        if (confirm(`Remove "${item.name}" from your pantry?`)) deleteItem(item.id);
      });
      grid.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  return { load, getAll, getById, addItem, updateItem, deleteItem, render, daysUntil, expiryState };
})();
