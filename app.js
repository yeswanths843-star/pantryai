// ============================================================
// js/app.js
// Bootstraps the app: view switching, the add/edit item modal,
// and wiring pantry changes to the gauge + grid re-render.
// ============================================================

const App = (() => {
  let editingId = null;

  function switchView(view) {
    document.getElementById("view-pantry").hidden = view !== "pantry";
    document.getElementById("view-assistant").hidden = view !== "assistant";
    document.querySelectorAll(".side-nav__item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === view);
    });
  }

  function updateGauge() {
    const items = Pantry.getAll();
    const score = AIService.computeLocalHealthScore(items);
    const circumference = 326.7;
    const offset = circumference - (circumference * score) / 100;
    document.getElementById("gaugeProgress").style.strokeDashoffset = offset;
    document.getElementById("gaugeScore").textContent = items.length ? score : "—";
  }

  function openAddItem() {
    editingId = null;
    document.getElementById("itemModalTitle").textContent = "Add pantry item";
    document.getElementById("itemForm").reset();
    document.getElementById("itemModalOverlay").hidden = false;
    document.getElementById("itemName").focus();
  }

  function openEditItem(id) {
    const item = Pantry.getById(id);
    if (!item) return;
    editingId = id;
    document.getElementById("itemModalTitle").textContent = "Edit pantry item";
    document.getElementById("itemName").value = item.name;
    document.getElementById("itemQuantity").value = item.quantity;
    document.getElementById("itemCategory").value = item.category;
    document.getElementById("itemExpiry").value = item.expiry;
    document.getElementById("itemModalOverlay").hidden = false;
  }

  function closeModal() {
    document.getElementById("itemModalOverlay").hidden = true;
    editingId = null;
  }

  function initModal() {
    document.getElementById("openAddItem").addEventListener("click", openAddItem);
    document.getElementById("closeItemModal").addEventListener("click", closeModal);
    document.getElementById("cancelItemModal").addEventListener("click", closeModal);
    document.getElementById("itemModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "itemModalOverlay") closeModal();
    });

    document.getElementById("itemForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById("itemName").value.trim(),
        quantity: document.getElementById("itemQuantity").value.trim(),
        category: document.getElementById("itemCategory").value,
        expiry: document.getElementById("itemExpiry").value,
      };
      if (editingId) Pantry.updateItem(editingId, payload);
      else Pantry.addItem(payload);
      closeModal();
    });
  }

  function initNav() {
    document.querySelectorAll(".side-nav__item").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
  }

  function initPantryToolbar() {
    document.getElementById("pantrySearch").addEventListener("input", Pantry.render);
    document.getElementById("pantryFilter").addEventListener("change", Pantry.render);
  }

  function init() {
    Pantry.load();
    initNav();
    initModal();
    initPantryToolbar();
    Chat.init();

    document.addEventListener("pantry:changed", () => {
      Pantry.render();
      updateGauge();
    });

    Pantry.render();
    updateGauge();
  }

  document.addEventListener("DOMContentLoaded", init);

  return { openEditItem };
})();
