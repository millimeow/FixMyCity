import { isStaff, homeFor, navigationFor, routeFor } from "./role-policy.js";
("use strict");
const $ = (s, root = document) => {
  return root.querySelector(s);
};
const main = $("#main");
const state = {
  user: null,
  csrf: null,
  meta: {
    categories: [],
    departments: [],
  },
  notifications: [],
  users: [],
  view: "grid",
  tab: "all",
  page: 1,
  filters: {
    q: "",
    city: "",
    category: "",
    status: "",
  },
  route: 0,
};
const paths = {
  close: "M6 6l12 12M18 6 6 18",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  list: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
  plus: "M12 5v14M5 12h14",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  search: "m21 21-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  clipboard: "M9 4H5v17h14V4h-4M9 2h6v5H9zM8 12h8M8 16h5",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  chart: "M4 3v18h17M8 16v-5M13 16V7M18 16V3",
  building: "M3 21V8h7V3h10v18M7 12h.01M7 16h.01M14 7h2M14 11h2M14 15h2M2 21h20",
  logout: "M9 3H4v18h5M14 8l5 4-5 4M8 12h11",
  menu: "M4 6h16M4 12h16M4 18h16",
  upload: "M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5",
  alert: "m12 3 10 18H2L12 3ZM12 9v5M12 17h.01",
  calendar: "M5 5h14v16H5zM8 2v6M16 2v6M5 10h14",
  road: "M7 2 3 22M17 2l4 20M12 3v4m0 4v3m0 4v3",
  waste: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  water: "M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13ZM8 15c0 2 1 3 3 3",
  drain: "M3 4h18v9H3zM7 4v9M12 4v9M17 4v9M2 18c3-3 5 3 8 0s5 3 8 0 4 0 4 0",
  light: "M4 22V5h13M4 8l5-3M14 5v4h6V5M14 12l-2 3M20 12l2 3M17 13v4",
  park: "M12 3 5 12h4l-5 6h16l-5-6h4L12 3ZM12 18v4",
  general: "M12 3 3 8v13h18V8l-9-5ZM8 12h8M8 16h8",
};

function icon(name) {
  return /* HTML */ `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="${paths[name] || paths.general}" />
  </svg>`;
}

function icons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    return (el.innerHTML = icon(el.dataset.icon));
  });
}

function esc(v = "") {
  return String(v ?? "").replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}

function date(v) {
  return new Date(v).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ago(v) {
  const days = Math.floor((Date.now() - new Date(v)) / 86400000);
  if (days === 0) {
    return "Today";
  } else {
    if (days === 1) {
      return "1 day ago";
    } else {
      return `${days} days ago`;
    }
  }
}

function label(s) {
  return s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => {
      return s.toUpperCase();
    });
}

function badge(s) {
  return `<span class="badge ${esc(s)}">${label(s)}</span>`;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    return el.classList.remove("visible");
  }, 4200);
}

async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (state.csrf) {
    headers["X-CSRF-Token"] = state.csrf;
  }
  const r = await fetch("/api" + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data.error || "Unable to complete request.");
    e.status = r.status;
    throw e;
  }
  return data;
}

function field(name, title, type = "text", extra = "") {
  return /* HTML */ `<div class="field">
    <label for="${name}">${title}</label
    ><input id="${name}" name="${name}" type="${type}" ${extra} />
  </div>`;
}

function options(items, selected = "", empty = "Select…") {
  return (
    /* HTML */ `<option value="">${empty}</option>` +
    items
      .map((o) => {
        return `<option value="${esc(o.id || o)}" ${(o.id || o) === selected ? "selected" : ""}>${esc(o.name || o)}</option>`;
      })
      .join("")
  );
}

function heading(title, subtitle, actions = "") {
  return /* HTML */ `<div class="page-heading">
    <div>
      <h1>${title}</h1>
      ${subtitle ? /* HTML */ `<p>${subtitle}</p>` : ""}
    </div>
    ${actions || /* HTML */ `<span class="date-label">${icon("calendar")}${date(new Date())}</span>`}
  </div>`;
}

function errorUI(e) {
  main.innerHTML =
    heading("Something needs attention", esc(e.message)) +
    `<a class="button secondary" href="#${homeFor(state.user)}">Back to ${isStaff(state.user) ? "workspace" : "community"}</a>`;
}

function renderShell() {
  const role = state.user?.role;
  const active = location.hash.slice(1).split("/")[0] || homeFor(state.user);
  const links = navigationFor(state.user);
  $(".brand").href = "#" + homeFor(state.user);
  $("#report-action").innerHTML = isStaff(state.user)
    ? ""
    : /* HTML */ `<a href="#report" class="button small"
        >${icon("plus")}Report an issue</a
      >`;
  $("#workspace-label").textContent = isStaff(state.user)
    ? "Workspace / "
    : "Community / ";
  $("#nav").innerHTML = links
    .map(([url, i, text]) => {
      return `<a href="#${url}" class="${active === url ? "active" : ""}" ${active === url ? 'aria-current="page"' : ""}>${icon(i)}${text}</a>`;
    })
    .join("");
  $("#account").innerHTML = state.user
    ? /* HTML */ `<div class="account-row">
        <span class="avatar"
          >${esc(
            state.user.name
              .split(" ")
              .map((n) => {
                return n[0];
              })
              .slice(0, 2)
              .join(""),
          )}</span
        >
        <div class="account-info">
          <strong>${esc(state.user.name)}</strong><small>${label(role)}</small>
        </div>
        <button class="icon-button" id="logout" aria-label="Sign out">
          ${icon("logout")}
        </button>
      </div>`
    : /* HTML */ `<a class="button secondary" href="#login"
        >Sign in to your account</a
      >`;
  $("#logout")?.addEventListener("click", async () => {
    try {
      await api("/auth/logout", {
        method: "POST",
        body: {},
      });
      state.user = null;
      state.csrf = null;
      state.notifications = [];
      location.hash = "board";
      renderShell();
      render();
      toast("You have signed out.");
    } catch (e) {
      toast(e.message);
    }
  });
  $("#unread").textContent = state.notifications.filter((n) => {
    return !n.readAt;
  }).length;
  $("#unread").hidden = !Number($("#unread").textContent);
  $("#page-label").textContent =
    links.find((x) => {
      return x[0] === active;
    })?.[2] ||
    {
      login: "Sign in",
      register: "Create account",
      complaint: "Report details",
    }[active] ||
    "Overview";
  icons();
}

async function refreshNotifications() {
  if (!state.user) {
    return;
  }
  try {
    state.notifications = await api("/notifications");
    renderShell();
  } catch {}
}

function art(name) {
  return /* HTML */ `<svg class="category-art" viewBox="0 0 300 115" aria-hidden="true">
    <circle cx="150" cy="64" r="66" fill="currentColor" opacity=".06" />
    <circle cx="150" cy="64" r="43" fill="none" stroke="currentColor" opacity=".1" />
    <path d="M30 90h55m130 0h55M53 25h30m131 0h34" stroke="currentColor" opacity=".2" />
    <g
      transform="translate(122 29) scale(2.3)"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="${paths[name] || paths.general}" />
    </g>
  </svg>`;
}

function skyline() {
  return /* HTML */ `<svg
    class="hero-art"
    viewBox="0 0 320 190"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="224" cy="59" r="35" fill="#d9e2be" />
    <path d="M13 170h295" stroke="#789178" />
    <path
      d="M30 169V94h42v75M82 169V64h35v105M125 169V35h44v134M179 169V80h37v89M228 169V104h51v65"
      fill="#cbd6ba"
      stroke="#87a186"
      stroke-width="1.5"
    />
    <path
      d="M36 106h29M36 120h29M36 134h29M89 76h21M89 91h21M89 106h21M133 48h27M133 64h27M133 80h27M133 96h27M187 92h21M187 107h21M237 117h33M237 132h33"
      stroke="#8aa486"
      stroke-width="2"
    />
    <path
      d="M125 169v-38h44v38M139 131v38M155 131v38"
      fill="#b7c6a9"
      stroke="#87a186"
    />
    <path d="M288 169v-35M277 143h22" stroke="#6e8e6c" stroke-width="2" />
    <circle cx="288" cy="121" r="18" fill="#a6bd96" />
    <path d="m53 77 8-9m-8 0 8 9" stroke="#93aa84" />
    <rect
      x="85"
      y="144"
      width="52"
      height="24"
      rx="3"
      fill="#f6f8ed"
      stroke="#88a180"
    />
    <path d="m99 155 5 5 12-13" stroke="#3b7350" stroke-width="2" />
  </svg>`;
}

function summary(data) {
  return /* HTML */ `<div class="summary-strip">
    ${[
      ["clipboard", data.total, "Reports in this view"],
      ["clock", data.active, "Awaiting resolution"],
      ["check", data.resolved, "Resolved & closed"],
      ["people", data.supports, "Community supports"],
    ]
      .map(([i, n, t]) => {
        return /* HTML */ `<div class="summary-item">
          <span class="summary-icon">${icon(i)}</span>
          <div><strong>${n}</strong><small>${t}</small></div>
        </div>`;
      })
      .join("")}
  </div>`;
}

function issueCard(complaint) {
  const overdue =
    new Date(complaint.dueAt) < new Date() &&
    !["RESOLVED", "CLOSED"].includes(complaint.status);
  return /* HTML */ `<article class="issue-card">
    <a
      class="issue-cover"
      data-category="${esc(complaint.category.icon)}"
      href="#complaint/${complaint.id}"
      aria-label="View ${esc(complaint.title)}"
      >${
        complaint.images.find((i) => {
          return i.kind === "REPORT";
        })
          ? `<img src="${esc(
              complaint.images.find((i) => {
                return i.kind === "REPORT";
              }).url,
            )}" alt="Reported issue" loading="lazy">`
          : art(complaint.category.icon)
      }${badge(complaint.status)}${complaint.id.startsWith("demo-") ? '<span class="sample-label">Sample report</span>' : ""}</a
    >
    <div class="issue-body">
      <p class="category-label">
        ${esc(complaint.category.name)}${overdue ? " · Overdue" : ""}
      </p>
      <h3><a href="#complaint/${complaint.id}">${esc(complaint.title)}</a></h3>
      <p class="location">
        ${icon("pin")}<span>${esc(complaint.ward)}, ${esc(complaint.city)}</span>
      </p>
    </div>
    <div class="issue-bottom">
      <span>${ago(complaint.createdAt)}</span
      >${isStaff(state.user) ? /* HTML */ `<span class="support-count">${icon("people")}${complaint.supportCount} supports</span>` : /* HTML */ `<button class="support-button ${complaint.supported ? "supported" : ""}" data-support="${complaint.id}" data-supported="${complaint.supported ? "true" : "false"}" aria-label="${complaint.supported ? "Remove support for" : "Support"} ${esc(complaint.title)}">${icon("heart")}<span>${complaint.supportCount} ${complaint.supportCount === 1 ? "support" : "supports"}</span></button>`}
    </div>
  </article>`;
}

async function wireSupport(root = main) {
  root.querySelectorAll("[data-support]").forEach((button) => {
    return button.addEventListener("click", async () => {
      if (!state.user) {
        location.hash = "login";
        return;
      }
      if (state.user.role !== "CITIZEN") {
        toast("Community support is available to citizen accounts.");
        return;
      }
      button.disabled = true;
      try {
        const result = await api(`/complaints/${button.dataset.support}/support`, {
          method: button.dataset.supported === "true" ? "DELETE" : "POST",
          body: {},
        });
        button.dataset.supported = String(result.supported);
        button.classList.toggle("supported", result.supported);
        button.querySelector("span").textContent =
          `${result.supportCount} ${result.supportCount === 1 ? "support" : "supports"}`;
        button.setAttribute(
          "aria-label",
          result.supported ? "Remove your support" : "Support this report",
        );
        toast(
          result.supported
            ? "Your support has been added."
            : "Your support has been removed.",
        );
      } catch (e) {
        toast(e.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function board(scope = "all") {
  const request = state.route;
  const isMine = scope === "mine",
    staff = scope === "assigned";
  const params = new URLSearchParams({
    ...state.filters,
    page: state.page,
    scope: scope === "all" ? "" : scope,
  });
  if (state.tab === "overdue") {
    params.set("overdue", "true");
  }
  if (state.tab === "resolved") {
    params.set("status", "RESOLVED");
  }
  if (state.tab === "active") {
    params.set("status", "IN_PROGRESS");
  }
  const data = await api("/complaints?" + params);
  if (request !== state.route) {
    return;
  }
  const title = isMine
    ? "Your reports, all in one place."
    : staff
      ? state.user.role === "ADMIN"
        ? "The city’s service desk."
        : "Your work makes a difference."
      : "A better neighbourhood starts here.";
  const subtitle = isMine
    ? "Follow every update, from your first report to the final fix."
    : staff
      ? "Keep requests moving. Give every report a clear next step."
      : "Report a problem. Follow the progress. Be part of the change.";
  main.innerHTML =
    heading(title, subtitle) +
    (scope === "all" &&
    !Object.values(state.filters).some(Boolean) &&
    state.tab === "all"
      ? /* HTML */ `<section class="hero">
          <div>
            <h2>Small reports.<br />Real change.</h2>
            <p>
              A safer footpath, a cleaner street, a light that works.<br />Let’s make
              Mumbai better, together.
            </p>
            <a href="#report" class="button">Report an issue ${icon("arrow")}</a>
          </div>
          ${skyline()}
        </section>`
      : "") +
    /* HTML */ `<section aria-label="Complaint browser">
      <div class="section-heading">
        <h2>
          ${isMine ? "My reports" : staff ? "Complaint queue" : "Around your community"}<span
            class="count-label"
            >${data.total} reports</span
          >
        </h2>
        <span class="muted count-label">Every report matters.</span>
      </div>
      <div class="board-tabs" role="group" aria-label="Quick filters">
        ${[
          ["all", "All reports"],
          ["active", "In progress"],
          ["resolved", "Resolved"],
          ["overdue", "Overdue"],
        ]
          .map(([v, t]) => {
            return `<button data-tab="${v}" class="${state.tab === v ? "active" : ""}" aria-pressed="${state.tab === v}">${t}</button>`;
          })
          .join("")}
      </div>
      <form id="filters" class="filters">
        <div class="search-wrap">
          ${icon("search")}<input
            aria-label="Search complaints"
            name="q"
            placeholder="Search issues, streets or neighbourhoods…"
            value="${esc(state.filters.q)}"
          />
        </div>
        <select name="category" aria-label="Filter by category">
          ${options(state.meta.categories, state.filters.category, "All categories")}</select
        ><select name="status" aria-label="Filter by status">
          ${options(
            [
              "SUBMITTED",
              "ASSIGNED",
              "IN_PROGRESS",
              "RESOLVED",
              "CLOSED",
              "REOPENED",
            ].map((id) => {
              return {
                id,
                name: label(id),
              };
            }),
            state.filters.status,
            "All statuses",
          )}
        </select>
        <div class="view-switch">
          <button
            type="button"
            class="icon-button ${state.view === "grid" ? "active" : ""}"
            data-view="grid"
            aria-label="Grid view"
          >
            ${icon("grid")}</button
          ><button
            type="button"
            class="icon-button ${state.view === "list" ? "active" : ""}"
            data-view="list"
            aria-label="List view"
          >
            ${icon("list")}
          </button>
        </div>
      </form>
      <div class="cards ${state.view}" id="results">
        ${data.items.map(issueCard).join("")}
      </div>
      ${
        !data.items.length
          ? /* HTML */ `<div class="empty">
              <h2>No reports here yet.</h2>
              <p>Try another filter or start with an issue in your neighbourhood.</p>
              <button id="clear-filters" class="button secondary">Clear filters</button>
            </div>`
          : ""
      }${data.pages > 1 ? /* HTML */ `<div class="pagination"><button class="button secondary small" id="prev" ${data.page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${data.page} of ${data.pages}</span><button class="button secondary small" id="next" ${data.page >= data.pages ? "disabled" : ""}>Next</button></div>` : ""}
    </section>`;
  if (staff) {
    const stats = await api("/analytics");
    if (request !== state.route) {
      return;
    }
    const el = document.createElement("div");
    el.innerHTML = summary(stats);
    $(".page-heading").after(el.firstElementChild);
  }
  const apply = () => {
    state.filters = Object.fromEntries(new FormData($("#filters")));
    state.page = 1;
    board(scope).catch(errorUI);
  };
  $("#filters").addEventListener("submit", (event) => {
    event.preventDefault();
    apply();
  });
  $("#filters")
    .querySelectorAll("select")
    .forEach((s) => {
      return s.addEventListener("change", apply);
    });
  let timer;
  $("#filters input").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 500);
  });
  main.querySelectorAll("[data-tab]").forEach((button) => {
    return button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      state.page = 1;
      board(scope).catch(errorUI);
    });
  });
  main.querySelectorAll("[data-view]").forEach((button) => {
    return button.addEventListener("click", () => {
      state.view = button.dataset.view;
      $("#results").className = "cards " + state.view;
      main.querySelectorAll("[data-view]").forEach((x) => {
        return x.classList.toggle("active", x === button);
      });
    });
  });
  $("#clear-filters")?.addEventListener("click", () => {
    resetFilters();
    board(scope).catch(errorUI);
  });
  $("#prev")?.addEventListener("click", () => {
    state.page--;
    board(scope).catch(errorUI);
  });
  $("#next")?.addEventListener("click", () => {
    state.page++;
    board(scope).catch(errorUI);
  });
  wireSupport();
}

function resetFilters() {
  state.filters = {
    q: "",
    city: "",
    category: "",
    status: "",
  };
  state.tab = "all";
  state.page = 1;
}

function requireRole(...roles) {
  if (!state.user) {
    location.hash = "login";
    return false;
  }
  if (roles.length && !roles.includes(state.user.role)) {
    main.innerHTML = heading(
      "This workspace is for a different role.",
      "Use the navigation to open your workspace.",
    );
    return false;
  }
  return true;
}

async function authPage(register = false) {
  main.innerHTML = /* HTML */ `<div class="auth-wrap">
    <div class="panel">
      <h1>${register ? "Join your neighbourhood." : "Welcome back."}</h1>
      <p class="muted">
        ${register ? "A better city starts with people like you." : "Sign in to help move your city forward."}
      </p>
      <form id="auth-form">
        ${register ? field("name", "Full name", "text", 'required minlength="2" maxlength="70" autocomplete="name"') : ""}${field("email", "Email address", "email", 'required maxlength="160" autocomplete="email"')}${field("password", "Password", "password", `required ${register ? 'minlength="12"' : ""} maxlength="128" autocomplete="${register ? "new-password" : "current-password"}"`)}${register ? '<p class="required-note">Use 12–128 characters, including uppercase, lowercase and a number.</p>' : ""}
        <div class="error-box" role="alert"></div>
        <button class="button" type="submit">
          ${register ? "Create citizen account" : "Sign in"} ${icon("arrow")}
        </button>
      </form>
      <p class="auth-switch">
        ${register ? 'Already have an account? <a href="#login">Sign in</a>' : 'New to Fix My City? <a href="#register">Create an account</a>'}
      </p>
      ${
        !register
          ? /* HTML */ `<div class="demo-box">
              <strong>Explore the local demo</strong>
              <p>
                Choose an account to fill in the demo credentials.<br />Password:
                CityDemo!2026
              </p>
              <div class="demo-buttons">
                <button data-demo="citizen">Citizen</button
                ><button data-demo="officer">Officer</button
                ><button data-demo="admin">Admin</button>
              </div>
            </div>`
          : ""
      }
    </div>
  </div>`;
  $("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    await submit(form, async () => {
      const data = await api("/auth/" + (register ? "register" : "login"), {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      });
      state.user = data.user;
      state.csrf = data.csrf;
      await refreshNotifications();
      location.hash = state.user.role === "CITIZEN" ? "board" : "dashboard";
      toast(
        register
          ? "Your account is ready. Welcome to Fix My City."
          : "You’re signed in.",
      );
    });
  });
  main.querySelectorAll("[data-demo]").forEach((button) => {
    return button.addEventListener("click", () => {
      $("#email").value = button.dataset.demo + "@fixmycity.local";
      $("#password").value = "CityDemo!2026";
      $("#auth-form button[type=submit]").focus();
    });
  });
}

async function submit(form, fn) {
  const button = form.querySelector("[type=submit]");
  const box = form.querySelector(".error-box");
  if (box) {
    box.textContent = "";
  }
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    if (box) {
      box.textContent = e.message;
    } else {
      toast(e.message);
    }
  } finally {
    button.disabled = false;
  }
}

async function imageData(input) {
  const files = [...input.files];
  if (files.length > 3) {
    throw new Error("Choose up to 3 photos.");
  }
  return Promise.all(
    files.map((file) => {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        throw new Error("Choose PNG, JPEG or WebP photos.");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("Each photo must be under 2 MB.");
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          return resolve(reader.result);
        };
        reader.onerror = () => {
          return reject(new Error("Unable to read photo."));
        };
        reader.readAsDataURL(file);
      });
    }),
  );
}

function uploadField(id = "images", required = false) {
  return /* HTML */ `<div class="field">
    <div class="upload-zone">
      <label for="${id}"
        >${icon("upload")}Add ${id === "evidence" ? "resolution" : "issue"}
        photographs${required ? " (required)" : ""}<small
          >PNG, JPEG or WebP · Up to 3 photos · 2 MB each</small
        ></label
      ><input
        type="file"
        id="${id}"
        name="${id}"
        accept="image/png,image/jpeg,image/webp"
        multiple
        ${required ? "required" : ""}
      />
    </div>
    <div class="previews" id="${id}-previews"></div>
  </div>`;
}

function wireImages(id) {
  $("#" + id)?.addEventListener("change", async (event) => {
    try {
      const images = await imageData(event.target);
      $("#" + id + "-previews").innerHTML = images
        .map((src) => {
          return `<img src="${src}" alt="Selected photograph preview">`;
        })
        .join("");
    } catch (err) {
      toast(err.message);
      event.target.value = "";
      $("#" + id + "-previews").innerHTML = "";
    }
  });
}

async function videoData(input) {
  const files = [...input.files];
  if (files.length > 1) {
    throw new Error("Choose one video.");
  }
  return Promise.all(
    files.map((file) => {
      if (!["video/mp4", "video/webm"].includes(file.type)) {
        throw new Error("Choose an MP4 or WebM video.");
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("The video must be 10 MB or smaller.");
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          return resolve(reader.result);
        };
        reader.onerror = () => {
          return reject(new Error("Unable to read this video."));
        };
        reader.readAsDataURL(file);
      });
    }),
  );
}

function videoField() {
  return /* HTML */ `<div class="field">
    <div class="upload-zone">
      <label for="videos"
        >${icon("upload")}Add an issue video <span class="label-help">(optional)</span
        ><small>MP4 or WebM · One video · Up to 10 MB</small></label
      ><input type="file" id="videos" name="videos" accept="video/mp4,video/webm" />
    </div>
    <div id="video-preview" class="video-preview"></div>
  </div>`;
}

function wireVideo() {
  const input = $("#videos");
  let version = 0;
  input.addEventListener("change", async () => {
    const current = ++version;
    try {
      const data = await videoData(input);
      if (current !== version || $("#videos") !== input) {
        return;
      }
      $("#video-preview").innerHTML = data.length
        ? /* HTML */ `<video
              controls
              playsinline
              preload="metadata"
              aria-label="Selected issue video preview"
              src="${data[0]}"
            ></video
            ><button class="button secondary small" type="button" id="remove-video">
              Remove video
            </button>`
        : "";
      $("#remove-video")?.addEventListener("click", () => {
        version++;
        input.value = "";
        $("#video-preview").innerHTML = "";
      });
    } catch (e) {
      if (current !== version || $("#videos") !== input) {
        return;
      }
      input.value = "";
      $("#video-preview").innerHTML = "";
      toast(e.message);
    }
  });
}

function videoGallery(videos = []) {
  if (videos.length) {
    return /* HTML */ /* HTML */ `<div class="video-evidence">
      <h3>Issue video</h3>
      ${videos
        .map((v) => {
          return /* HTML */ /* HTML */ `<figure>
            <video
              controls
              playsinline
              preload="metadata"
              aria-label="Reported issue video"
            >
              <source src="${esc(v.url)}" type="${esc(v.mimeType)}" />
              Your browser cannot play this video.
            </video>
            <figcaption>
              Citizen video · ${date(v.createdAt)} ·
              ${(v.sizeBytes / 1024 / 1024).toFixed(1)} MB ·
              <a href="${esc(v.url)}" target="_blank" rel="noopener">Open video</a>
            </figcaption>
          </figure>`;
        })
        .join("")}
    </div>`;
  } else {
    return "";
  }
}

async function reportPage() {
  if (!requireRole("CITIZEN")) {
    return;
  }
  main.innerHTML =
    heading(
      "Let’s get it fixed.",
      "Tell us what’s happening. We’ll route it to the right department.",
    ) +
    /* HTML */ `<div class="report-layout">
      <form id="report-form" class="panel">
        <p class="required-note">All fields are required unless marked optional.</p>
        <section class="form-section">
          <h2>About the issue</h2>
          <div class="field">
            <label for="categoryId">Issue category</label
            ><select id="categoryId" name="categoryId" required>
              ${options(state.meta.categories)}
            </select>
          </div>
          ${field("title", "Give your report a clear title", "text", 'required minlength="8" maxlength="120" placeholder="e.g. Pothole near Andheri station entrance"')}
          <div class="field">
            <label for="description">What needs attention?</label
            ><textarea
              id="description"
              name="description"
              required
              minlength="20"
              maxlength="3000"
              placeholder="Describe the problem, how long it has been there, and who it affects."
            ></textarea>
          </div>
          <div class="field">
            <label for="priority">Priority</label
            ><select id="priority" name="priority">
              <option value="NORMAL">Normal — 72-hour target</option>
              <option value="URGENT">Urgent — 24-hour target</option></select
            ><small
              >For immediate danger, contact local emergency services directly.</small
            >
          </div>
        </section>
        <section class="form-section">
          <h2>Where is it?</h2>
          <div class="form-grid">
            <div class="field">
              <label for="city">City</label
              ><input
                id="city"
                name="city"
                value="Mumbai"
                readonly
                aria-readonly="true"
              />
            </div>
            ${field("ward", "Ward / neighbourhood", "text", 'required minlength="2" maxlength="80" placeholder="e.g. Dadar, Andheri, Borivali"')}
            <div class="full">
              ${field("address", "Street address and nearby landmark", "text", 'required minlength="8" maxlength="240" placeholder="e.g. SV Road, opposite Andheri railway station"')}
            </div>
          </div>
          <details>
            <summary>
              Add coordinates
              <span class="label-help"
                >(optional, for nearby duplicate suggestions)</span
              >
            </summary>
            <div class="form-grid">
              ${field("latitude", "Latitude", "number", 'step="any" min="-90" max="90" placeholder="19.077"')}${field("longitude", "Longitude", "number", 'step="any" min="-180" max="180" placeholder="72.998"')}
            </div>
            <small
              >Enter known coordinates. Your browser location is never requested.</small
            >
          </details>
        </section>
        <section class="form-section">
          <h2>Add a little more context</h2>
          ${uploadField()}${videoField()}<small class="muted"
            >Photos and video are optional. Avoid including faces, vehicle plates or
            personal information.</small
          >
        </section>
        <div class="error-box" role="alert"></div>
        <div class="form-actions">
          <a class="button secondary" href="#board">Cancel</a
          ><button class="button" type="submit">Submit report ${icon("arrow")}</button>
        </div>
      </form>
      <aside class="report-aside">
        <h3>A clear report goes a long way.</h3>
        <ul>
          <li>Choose the category that fits best.</li>
          <li>Be specific about the street or landmark.</li>
          <li>Use photos that show the issue clearly.</li>
          <li>Check for an existing report nearby.</li>
        </ul>
        <p>
          Your report is automatically sent to the relevant department. You can follow
          updates in My reports.
        </p>
        <div id="duplicates" class="duplicates"></div>
      </aside>
    </div>`;
  wireImages("images");
  wireVideo();
  let timer,
    seq = 0;
  const check = async () => {
    const n = ++seq;
    const form = Object.fromEntries(new FormData($("#report-form")));
    if (form.title.length < 5 || !form.city) {
      return;
    }
    try {
      const data = await api(
        "/complaints/duplicates?" +
          new URLSearchParams({
            title: form.title,
            address: form.address,
            city: form.city,
            ward: form.ward,
            categoryId: form.categoryId,
            latitude: form.latitude,
            longitude: form.longitude,
          }),
      );
      if (n !== seq || !$("#duplicates")) {
        return;
      }
      $("#duplicates").innerHTML = data.length
        ? /* HTML */ `<h3>Already reported nearby?</h3>
            <p>Support a matching report to keep updates together.</p>
            ${data
              .map((complaint) => {
                return /* HTML */ `<a
                  class="duplicate-link"
                  href="#complaint/${complaint.id}"
                  >${esc(complaint.title)}<small
                    >${esc(complaint.ward)}${complaint.distance !== null ? " · " + complaint.distance + " m away" : ""}
                    · Suggested match</small
                  ></a
                >`;
              })
              .join("")}`
        : "<p>No close matches found yet. You can submit a new report.</p>";
    } catch {}
  };
  $("#report-form").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(check, 600);
  });
  $("#report-form").addEventListener("change", check);
  $("#report-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submit(event.currentTarget, async () => {
      const data = Object.fromEntries(new FormData(event.target));
      delete data.images;
      data.images = await imageData($("#images"));
      data.videos = await videoData($("#videos"));
      const result = await api("/complaints", {
        method: "POST",
        body: data,
      });
      await refreshNotifications();
      location.hash = "complaint/" + result.id;
      toast("Report submitted. Your department has been notified.");
    });
  });
}

async function detailPage(id) {
  const request = state.route;
  const complaint = await api("/complaints/" + encodeURIComponent(id));
  if (request !== state.route) {
    return;
  }
  const owner = complaint.isOwner,
    role = state.user?.role;
  const staff =
    role === "ADMIN" || (role === "OFFICER" && complaint.officerId === state.user.id);
  const overdue =
    new Date(complaint.dueAt) < new Date() &&
    !["RESOLVED", "CLOSED"].includes(complaint.status);
  if (role === "ADMIN" && !state.users.length) {
    state.users = await api("/admin/users");
  }
  if (request !== state.route) {
    return;
  }
  main.innerHTML = /* HTML */ `<a href="#${homeFor(state.user)}" class="back-link"
      >${icon("back")}Back to ${isStaff(state.user) ? "workspace" : "community"}</a
    >
    <div class="detail-heading">
      <div class="page-actions">
        ${badge(complaint.status)}${complaint.priority === "URGENT" ? '<span class="badge urgent">Urgent</span>' : ""}${overdue ? '<span class="badge overdue">Overdue</span>' : ""}${complaint.escalatedAt ? '<span class="badge overdue">Escalated</span>' : ""}
      </div>
      <h1>${esc(complaint.title)}</h1>
      <div class="detail-meta">
        <span>${icon("pin")}${esc(complaint.ward)}, ${esc(complaint.city)}</span
        ><span>Reported ${date(complaint.createdAt)}</span
        ><span
          >Reference
          ${esc(complaint.id.startsWith("demo-") ? complaint.id : complaint.id.slice(-8).toUpperCase())}</span
        >
      </div>
    </div>
    <div class="detail-layout">
      <div class="detail-main">
        <section class="panel">
          <h2>What’s happening</h2>
          ${complaint.id.startsWith("demo-") ? '<p class="hint">This fictional sample report demonstrates the workflow. It does not represent an actual municipal complaint.</p>' : ""}
          <p class="detail-description">${esc(complaint.description)}</p>
          ${
            complaint.images.length
              ? /* HTML */ `<div class="photo-grid">
                  ${complaint.images
                    .map((i) => {
                      return /* HTML */ `<figure>
                        <a href="${esc(i.url)}" target="_blank" rel="noopener"
                          ><img
                            src="${esc(i.url)}"
                            alt="${i.kind === "REPORT" ? "Original issue photograph" : "Officer resolution photograph"}"
                            loading="lazy"
                        /></a>
                        <figcaption>
                          ${i.kind === "REPORT" ? "Reported issue" : "Resolution evidence"}
                          · ${date(i.createdAt)}
                        </figcaption>
                      </figure>`;
                    })
                    .join("")}
                </div>`
              : '<p class="list-message">No photographs attached.</p>'
          }${videoGallery(complaint.videos)}${
            !isStaff(state.user)
              ? /* HTML */ `<div class="operation-panel">
                  <button
                    class="button secondary support-button ${complaint.supported ? "supported" : ""}"
                    data-support="${complaint.id}"
                    data-supported="${complaint.supported}"
                  >
                    ${icon("heart")}<span
                      >${complaint.supportCount}
                      ${complaint.supportCount === 1 ? "support" : "supports"}</span
                    >
                  </button>
                  <p class="list-message">
                    Affected by this too? Support this report to receive updates.
                  </p>
                </div>`
              : ""
          }
        </section>
        <section class="panel">
          <h2>Progress timeline</h2>
          <ol class="timeline">
            ${complaint.history
              .map((h) => {
                return /* HTML */ `<li>
                  <strong>${label(h.status)}</strong>
                  <p>${esc(h.note)}</p>
                  <small
                    >${date(h.createdAt)} ·
                    ${new Date(h.createdAt).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    · ${esc(h.actor?.name || "Fix My City system")}</small
                  >
                </li>`;
              })
              .join("")}
          </ol>
        </section>
        ${
          owner && complaint.status === "RESOLVED"
            ? /* HTML */ `<section class="panel">
                <h2>Was the issue fixed?</h2>
                <p class="muted">Review the resolution and tell us how it went.</p>
                <form id="feedback-form" class="operation-panel">
                  <div class="field">
                    <label for="rating">Your rating</label
                    ><select id="rating" name="rating" required>
                      <option value="">Choose a rating</option>
                      ${[5, 4, 3, 2, 1]
                        .map((n) => {
                          return `<option value="${n}">${n} / 5 — ${["", "Poor", "Needs improvement", "Okay", "Good", "Excellent"][n]}</option>`;
                        })
                        .join("")}
                    </select>
                  </div>
                  <div class="field">
                    <label for="comment">Tell us more</label
                    ><textarea
                      id="comment"
                      name="comment"
                      required
                      minlength="5"
                      maxlength="1000"
                    ></textarea>
                  </div>
                  <div class="field">
                    <label class="checkbox-label"
                      ><input type="checkbox" name="reopen" />The issue still needs
                      work. Reopen this report.</label
                    >
                  </div>
                  <div class="error-box" role="alert"></div>
                  <button class="button" type="submit">Send feedback</button>
                </form>
              </section>`
            : ""
        }${
          complaint.feedback.length
            ? /* HTML */ `<section class="panel">
                <h2>Citizen feedback</h2>
                ${complaint.feedback
                  .map((feedbackEntry) => {
                    return /* HTML */ `<div class="feedback-item">
                      <strong>${feedbackEntry.rating} / 5</strong>
                      <small
                        >·
                        ${date(feedbackEntry.createdAt)}${feedbackEntry.reopened ? " · Reopened" : ""}</small
                      >
                      <p>${esc(feedbackEntry.comment)}</p>
                    </div>`;
                  })
                  .join("")}
              </section>`
            : ""
        }
      </div>
      <aside>
        <section class="panel">
          <h2>Report details</h2>
          <dl class="facts">
            <div>
              <dt>Category</dt>
              <dd>${esc(complaint.category.name)}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>${esc(complaint.department.name)}</dd>
            </div>
            <div>
              <dt>Assigned officer</dt>
              <dd>${esc(complaint.officer?.name || "Awaiting assignment")}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>${esc(complaint.address)}</dd>
            </div>
            <div>
              <dt>Target resolution</dt>
              <dd>${date(complaint.dueAt)}</dd>
            </div>
            ${
              complaint.resolvedAt
                ? /* HTML */ `<div>
                    <dt>Resolved</dt>
                    <dd>${date(complaint.resolvedAt)}</dd>
                  </div>`
                : ""
            }
          </dl>
          ${
            role === "ADMIN" && !["RESOLVED", "CLOSED"].includes(complaint.status)
              ? /* HTML */ `<form id="assign-form" class="operation-panel">
                  <h3>Manage assignment</h3>
                  <div class="field">
                    <label for="departmentId">Department</label
                    ><select id="departmentId" name="departmentId" required>
                      ${options(state.meta.departments, complaint.departmentId)}
                    </select>
                  </div>
                  <div class="field">
                    <label for="officerId">Officer</label
                    ><select id="officerId" name="officerId">
                      ${options(
                        state.users.filter((user) => {
                          return (
                            user.role === "OFFICER" &&
                            user.departmentId === complaint.departmentId
                          );
                        }),
                        complaint.officerId,
                        "Awaiting assignment",
                      )}
                    </select>
                  </div>
                  <div class="error-box" role="alert"></div>
                  <button class="button" type="submit">Save assignment</button>
                </form>`
              : ""
          }
        </section>
        ${
          staff && ["ASSIGNED", "REOPENED", "IN_PROGRESS"].includes(complaint.status)
            ? /* HTML */ `<section class="panel">
                <h2>Update this report</h2>
                <form id="status-form">
                  <div class="field">
                    <label for="status">Next status</label
                    ><select name="status" id="status">
                      ${complaint.status === "IN_PROGRESS" ? '<option value="RESOLVED">Resolved</option>' : '<option value="IN_PROGRESS">In progress</option>'}
                    </select>
                  </div>
                  <div class="field">
                    <label for="note">Progress note</label
                    ><textarea
                      name="note"
                      id="note"
                      required
                      minlength="5"
                      maxlength="1000"
                      placeholder="What has been done? What happens next?"
                    ></textarea>
                  </div>
                  ${uploadField("evidence", complaint.status === "IN_PROGRESS")}
                  <div class="error-box" role="alert"></div>
                  <button class="button" type="submit">Post update</button>
                </form>
              </section>`
            : ""
        }
      </aside>
    </div>`;
  wireSupport();
  wireImages("evidence");
  $("#departmentId")?.addEventListener("change", (event) => {
    $("#officerId").innerHTML = options(
      state.users.filter((user) => {
        return user.role === "OFFICER" && user.departmentId === event.target.value;
      }),
      "",
      "Awaiting assignment",
    );
  });
  $("#assign-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submit(event.currentTarget, async () => {
      await api(`/complaints/${id}/assign`, {
        method: "POST",
        body: Object.fromEntries(new FormData(event.target)),
      });
      await detailPage(id);
      await refreshNotifications();
      toast("Assignment saved.");
    });
  });
  $("#status-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submit(event.currentTarget, async () => {
      const body = Object.fromEntries(new FormData(event.target));
      delete body.evidence;
      body.images = await imageData($("#evidence"));
      await api(`/complaints/${id}/status`, {
        method: "POST",
        body,
      });
      await detailPage(id);
      await refreshNotifications();
      toast("Progress update posted.");
    });
  });
  $("#feedback-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submit(event.currentTarget, async () => {
      const body = Object.fromEntries(new FormData(event.target));
      body.reopen = body.reopen === "on";
      await api(`/complaints/${id}/feedback`, {
        method: "POST",
        body,
      });
      await detailPage(id);
      await refreshNotifications();
      toast(
        body.reopen
          ? "Your report has been reopened."
          : "Thank you. Your report is now closed.",
      );
    });
  });
}

async function notificationsPage() {
  if (!requireRole()) {
    return;
  }
  state.notifications = await api("/notifications");
  main.innerHTML =
    heading(
      "You’re in the loop.",
      "Updates on the reports and neighbourhoods you care about.",
      /* HTML */ `<button class="button secondary small" id="read-all">
        Mark all as read
      </button>`,
    ) +
    /* HTML */ `<div class="panel notice-list">
      ${
        state.notifications
          .map((n) => {
            return /* HTML */ `<article class="notice ${n.readAt ? "" : "new"}">
              <span class="notice-symbol">${icon("bell")}</span>
              <div>
                <p>
                  ${n.complaintId ? `<a href="#complaint/${n.complaintId}">${esc(n.message)}</a>` : esc(n.message)}
                </p>
                <small
                  >${date(n.createdAt)} ·
                  ${ago(n.createdAt)}${n.readAt ? "" : " · Unread"}</small
                >
              </div>
            </article>`;
          })
          .join("") ||
        '<div class="empty"><h2>All quiet for now.</h2><p>Your report updates will appear here.</p></div>'
      }
    </div>`;
  $("#read-all").addEventListener("click", async () => {
    try {
      await api("/notifications/read", {
        method: "POST",
        body: {},
      });
      await notificationsPage();
      renderShell();
      toast("Notifications marked as read.");
    } catch (e) {
      toast(e.message);
    }
  });
  renderShell();
}

function bars(items) {
  const max = Math.max(
    1,
    ...items.map((i) => {
      return i.total;
    }),
  );
  return items
    .map((i) => {
      return /* HTML */ `<div class="bar-row">
        <span>${esc(i.name)}</span>
        <div class="bar-track">
          <div class="bar-fill" data-width="${Math.round((i.total / max) * 100)}"></div>
        </div>
        <strong>${i.total}</strong>
      </div>`;
    })
    .join("");
}

async function analyticsPage() {
  if (!requireRole("ADMIN", "OFFICER")) {
    return;
  }
  const request = state.route;
  const a = await api("/analytics");
  if (request !== state.route) {
    return;
  }
  main.innerHTML =
    heading(
      "A clearer picture of your city.",
      "Real-time service activity, calculated from the reports in this database.",
      state.user.role === "ADMIN"
        ? '<button class="button secondary small" id="escalate">Check overdue reports</button>'
        : "",
    ) +
    summary(a) +
    /* HTML */ `<div class="analytics-grid">
      <section class="panel">
        <h2>Reports by category</h2>
        ${bars(a.categories)}
      </section>
      <section class="panel">
        <h2>Department workload</h2>
        ${bars(a.departments)}
      </section>
      <section class="panel">
        <h2>Reporting over time</h2>
        <p class="muted">Reports submitted in the last six months</p>
        <div class="trend">
          ${a.trend
            .map((t) => {
              return /* HTML */ `<div class="trend-col">
                <b>${t.total}</b>
                <div
                  class="trend-bar"
                  data-height="${Math.max(
                    1,
                    (t.total /
                      Math.max(
                        1,
                        ...a.trend.map((x) => {
                          return x.total;
                        }),
                      )) *
                      120,
                  )}"
                ></div>
                <span>${esc(t.month)}</span>
              </div>`;
            })
            .join("")}
        </div>
      </section>
      <section class="panel">
        <h2>Service performance</h2>
        <dl class="facts">
          <div>
            <dt>Resolved / closed</dt>
            <dd>${a.resolved} of ${a.total}</dd>
          </div>
          <div>
            <dt>Average time to resolution</dt>
            <dd>${a.averageHours} hours</dd>
          </div>
          <div>
            <dt>Overdue active reports</dt>
            <dd>${a.overdue}</dd>
          </div>
          <div>
            <dt>Escalated reports</dt>
            <dd>${a.escalated}</dd>
          </div>
          <div>
            <dt>Citizen satisfaction</dt>
            <dd>
              ${a.averageRating === null ? "No feedback yet" : a.averageRating + " / 5"}
            </dd>
          </div>
        </dl>
        <p class="list-message">
          Officer accounts see their assigned reports. Averages include resolved and
          citizen-confirmed reports.
        </p>
      </section>
    </div>`;
  main.querySelectorAll("[data-width]").forEach((element) => {
    return (element.style.width = element.dataset.width + "%");
  });
  main.querySelectorAll("[data-height]").forEach((element) => {
    return (element.style.height = element.dataset.height + "px");
  });
  $("#escalate")?.addEventListener("click", async (event) => {
    event.target.disabled = true;
    try {
      const r = await api("/admin/escalate", {
        method: "POST",
        body: {},
      });
      toast(
        r.count
          ? `${r.count} overdue reports escalated.`
          : "No new overdue reports to escalate.",
      );
      await analyticsPage();
    } catch (err) {
      toast(err.message);
    } finally {
      event.target.disabled = false;
    }
  });
}

async function managePage(tab = "staff") {
  if (!requireRole("ADMIN")) {
    return;
  }
  const request = state.route;
  state.users = await api("/admin/users");
  if (request !== state.route) {
    return;
  }
  const departments = state.meta.departments,
    categories = state.meta.categories;
  main.innerHTML =
    heading(
      "People behind the progress.",
      "Manage staff access, departments and complaint routing.",
    ) +
    /* HTML */ `<div class="board-tabs" aria-label="Administration sections">
        ${[
          ["staff", "Staff & accounts"],
          ["departments", "Departments"],
          ["categories", "Categories"],
        ]
          .map(([v, t]) => {
            return `<button data-manage="${v}" class="${tab === v ? "active" : ""}">${t}</button>`;
          })
          .join("")}
      </div>
      <div class="admin-layout">
        <section class="panel table-scroll">
          <h2>
            ${tab === "staff" ? "Account directory" : tab === "departments" ? "Municipal departments" : "Complaint categories"}
          </h2>
          ${
            tab === "staff"
              ? /* HTML */ `<table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${state.users
                      .map((user) => {
                        return /* HTML */ `<tr>
                          <td>
                            ${esc(user.name)}<span class="muted"
                              >${esc(user.email)}</span
                            >
                          </td>
                          <td>${label(user.role)}</td>
                          <td>${esc(user.department?.name || "—")}</td>
                        </tr>`;
                      })
                      .join("")}
                  </tbody>
                </table>`
              : tab === "departments"
                ? /* HTML */ `<table>
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>Responsibility</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${departments
                        .map((d) => {
                          return /* HTML */ `<tr>
                            <td>${esc(d.name)}</td>
                            <td>${esc(d.description)}</td>
                          </tr>`;
                        })
                        .join("")}
                    </tbody>
                  </table>`
                : /* HTML */ `<table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Routes to</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${categories
                        .map((complaint) => {
                          return /* HTML */ `<tr>
                            <td>${esc(complaint.name)}</td>
                            <td>${esc(complaint.department.name)}</td>
                          </tr>`;
                        })
                        .join("")}
                    </tbody>
                  </table>`
          }
        </section>
        <form id="manage-form" class="panel">
          <h2>
            ${tab === "staff" ? "Add a staff account" : tab === "departments" ? "Add a department" : "Add a category"}
          </h2>
          ${
            tab === "staff"
              ? /* HTML */ `${field("name", "Full name", "text", 'required minlength="2" maxlength="70"')}${field("email", "Email address", "email", 'required maxlength="160"')}${field("password", "Initial password", "password", 'required minlength="12" maxlength="128" autocomplete="new-password"')}
                  <p class="required-note">
                    At least 12 characters, with uppercase, lowercase and a number.
                  </p>
                  <div class="field">
                    <label for="role">Account role</label
                    ><select id="role" name="role">
                      <option value="OFFICER">Officer</option>
                      <option value="ADMIN">Administrator</option>
                    </select>
                  </div>`
              : field(
                  "name",
                  tab === "departments" ? "Department name" : "Category name",
                  "text",
                  'required minlength="3" maxlength="80"',
                )
          }${
            tab === "departments"
              ? '<div class="field"><label for="description">Responsibility</label><textarea id="description" name="description" required minlength="5" maxlength="400"></textarea></div>'
              : /* HTML */ `<div class="field" id="department-field">
                  <label for="departmentId">Department</label
                  ><select id="departmentId" name="departmentId" required>
                    ${options(departments)}
                  </select>
                </div>`
          }
          <div class="error-box" role="alert"></div>
          <button class="button" type="submit">
            ${tab === "staff" ? "Create staff account" : tab === "departments" ? "Create department" : "Create category"}
          </button>
        </form>
      </div>`;
  main.querySelectorAll("[data-manage]").forEach((button) => {
    return button.addEventListener("click", () => {
      return managePage(button.dataset.manage).catch(errorUI);
    });
  });
  $("#role")?.addEventListener("change", (event) => {
    const needed = event.target.value === "OFFICER";
    $("#department-field").hidden = !needed;
    $("#departmentId").required = needed;
  });
  $("#manage-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submit(event.currentTarget, async () => {
      await api("/admin/" + (tab === "staff" ? "users" : tab), {
        method: "POST",
        body: Object.fromEntries(new FormData(event.target)),
      });
      state.meta = await api("/meta");
      await managePage(tab);
      toast("Created successfully.");
    });
  });
}

async function render() {
  state.route++;
  const route = location.hash.slice(1) || homeFor(state.user);
  const [page, id] = route.split("/");
  const destination = routeFor(state.user, page);
  if (destination !== page) {
    location.replace("#" + destination);
    return;
  }
  renderShell();
  main.innerHTML = '<div class="loading" role="status">Loading your city…</div>';
  setMenu(false);
  document.title =
    ({
      board: "Community board",
      mine: "My reports",
      report: "Report an issue",
      dashboard: "My workspace",
      analytics: "City analytics",
      manage: "Administration",
      notifications: "Notifications",
      login: "Sign in",
      register: "Create account",
      complaint: "Report details",
    }[page] || "Fix My City") + " · Fix My City";
  try {
    if (page === "board") {
      await board();
    } else if (page === "mine") {
      if (requireRole("CITIZEN")) {
        await board("mine");
      }
    } else if (page === "dashboard") {
      if (requireRole("ADMIN", "OFFICER")) {
        await board("assigned");
      }
    } else if (page === "report") {
      await reportPage();
    } else if (page === "login" || page === "register") {
      await authPage(page === "register");
    } else if (page === "complaint" && id) {
      await detailPage(id);
    } else if (page === "notifications") {
      await notificationsPage();
    } else if (page === "analytics") {
      await analyticsPage();
    } else if (page === "manage") {
      await managePage();
    } else {
      main.innerHTML =
        heading("This page isn’t here.", "Use your navigation to find reports.") +
        `<a class="button" href="#${homeFor(state.user)}">Open ${isStaff(state.user) ? "workspace" : "community board"}</a>`;
    }
  } catch (e) {
    errorUI(e);
  }
}
$(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});
const mobileMenu = window.matchMedia("(max-width: 760px)");

function setMenu(open) {
  $("#sidebar").classList.toggle("open", open);
  $("#menu").setAttribute("aria-expanded", String(open));
  $("#sidebar").inert = mobileMenu.matches && !open;
}
$("#menu").addEventListener("click", () => {
  setMenu(!$("#sidebar").classList.contains("open"));
  if ($("#sidebar").classList.contains("open")) {
    $("#close-menu").focus();
  }
});
$("#close-menu").addEventListener("click", () => {
  setMenu(false);
  $("#menu").focus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    setMenu(false);
    if (mobileMenu.matches) {
      $("#menu").focus();
    }
  }
});
document.addEventListener("click", (event) => {
  if (
    mobileMenu.matches &&
    $("#sidebar").classList.contains("open") &&
    !event.target.closest("#sidebar") &&
    !event.target.closest("#menu")
  ) {
    setMenu(false);
  }
});
mobileMenu.addEventListener("change", () => {
  return setMenu(false);
});
setMenu(false);
window.addEventListener("hashchange", () => {
  resetFilters();
  render();
  window.scrollTo(0, 0);
});

async function start() {
  icons();
  try {
    state.meta = await api("/meta");
    try {
      const me = await api("/auth/me");
      state.user = me.user;
      state.csrf = me.csrf;
      await refreshNotifications();
    } catch (e) {
      if (e.status !== 401) {
        throw e;
      }
    }
    await render();
  } catch (e) {
    errorUI(e);
  }
}
start();
setInterval(() => {
  if (state.user) {
    refreshNotifications();
  }
}, 60000);
