import { marked } from "marked";

const FIRESTORE_QUERY_ENDPOINT =
  "https://firestore.googleapis.com/v1/projects/rohansatram-770ee/databases/(default)/documents:runQuery";
const CACHE_KEY = "til_published_posts";

// DOM Elements - Navigation
const tilNavIndex = document.getElementById("til-nav-index");
const tilNavTil = document.getElementById("til-nav-til");
const backToTilButton = document.getElementById("back-to-til-button");

// DOM Elements - Views
const tilIndexView = document.getElementById("til-index-view");
const tilPostView = document.getElementById("til-post-view");
const tilLoading = document.getElementById("til-loading");
const tilEmpty = document.getElementById("til-empty");
const tilList = document.getElementById("til-list");

// DOM Elements - Pagination
const tilPagination = document.getElementById("til-pagination");
const tilPrevButton = document.getElementById("til-prev-button");
const tilNextButton = document.getElementById("til-next-button");
const tilPaginationInfo = document.getElementById("til-pagination-info");

// DOM Elements - Article
const articleTitle = document.getElementById("article-title");
const articleDate = document.getElementById("article-date");
const articleContent = document.getElementById("article-content");

// State
const PAGE_SIZE = 10;
let currentPage = 1;
let publishedPosts = [];

// Date Formatter
function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseFirestoreValue(valueObj) {
  if (!valueObj) return null;
  if ("stringValue" in valueObj) return valueObj.stringValue;
  if ("booleanValue" in valueObj) return valueObj.booleanValue;
  if ("integerValue" in valueObj) return parseInt(valueObj.integerValue, 10);
  if ("doubleValue" in valueObj) return parseFloat(valueObj.doubleValue);
  if ("timestampValue" in valueObj) return valueObj.timestampValue;
  if ("nullValue" in valueObj) return null;
  if ("mapValue" in valueObj) {
    const fields = valueObj.mapValue.fields || {};
    const result = {};
    for (const [k, v] of Object.entries(fields)) {
      result[k] = parseFirestoreValue(v);
    }
    return result;
  }
  if ("arrayValue" in valueObj) {
    const values = valueObj.arrayValue.values || [];
    return values.map(parseFirestoreValue);
  }
  return null;
}

function parseFirestoreDoc(doc) {
  const id = doc.name ? doc.name.split("/").pop() : "";
  const data = {};
  if (doc.fields) {
    for (const [key, val] of Object.entries(doc.fields)) {
      data[key] = parseFirestoreValue(val);
    }
  }
  return { id, ...data };
}

function getTimestampMillis(val) {
  if (!val) return 0;
  if (typeof val === "string") return new Date(val).getTime() || 0;
  if (typeof val.toMillis === "function") return val.toMillis();
  if (typeof val.getTime === "function") return val.getTime();
  return 0;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Show Archive Index View
function showIndexView() {
  tilIndexView.hidden = false;
  tilPostView.hidden = true;
  tilNavIndex.hidden = false;
  tilNavTil.hidden = true;
  document.title = "rohan satram / til";
}

// Show Single Post View
function showPostView(post) {
  if (!post) return;

  tilIndexView.hidden = true;
  tilPostView.hidden = false;
  tilNavIndex.hidden = true;
  tilNavTil.hidden = false;

  articleTitle.textContent = post.title || "untitled";
  articleDate.textContent = formatDate(post.createdAt);
  articleContent.innerHTML = marked.parse(post.content || "");

  document.title = `${post.title || "post"} · rohan satram / til`;
}

// Render the 10 posts on the current page
function renderPosts() {
  tilList.innerHTML = "";

  if (publishedPosts.length === 0) {
    tilEmpty.hidden = false;
    tilPagination.hidden = true;
    return;
  }

  tilEmpty.hidden = true;

  const totalPages = Math.ceil(publishedPosts.length / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pagePosts = publishedPosts.slice(startIdx, startIdx + PAGE_SIZE);

  pagePosts.forEach((post) => {
    const li = document.createElement("li");
    li.className = "til-item";

    const postSlug = post.slug || post.id;
    const postUrl = `/til?post=${encodeURIComponent(postSlug)}`;

    li.innerHTML = `
      <a href="${postUrl}" class="til-item-title">${escapeHtml(post.title || "untitled")}</a>
      <span class="til-item-date muted">${formatDate(post.createdAt)}</span>
    `;

    li.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({ postSlug }, "", postUrl);
      showPostView(post);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    tilList.appendChild(li);
  });

  if (publishedPosts.length > PAGE_SIZE) {
    tilPagination.hidden = false;
    tilPaginationInfo.textContent = `page ${currentPage} of ${totalPages}`;
    tilPrevButton.disabled = currentPage <= 1;
    tilNextButton.disabled = currentPage >= totalPages;
  } else {
    tilPagination.hidden = true;
  }
}

// Check URL query parameters to route to a post or index
function checkRoute() {
  const params = new URLSearchParams(window.location.search);
  const targetPost = params.get("post") || window.location.hash.replace("#", "");

  if (targetPost && publishedPosts.length > 0) {
    const post = publishedPosts.find(
      (p) => (p.slug && p.slug === targetPost) || p.id === targetPost
    );
    if (post) {
      showPostView(post);
      return;
    }
  }

  showIndexView();
}

// Fetch published posts from Firestore via REST API
async function loadPublishedPosts() {
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      publishedPosts = JSON.parse(cached);
      tilLoading.hidden = true;
      renderPosts();
      checkRoute();
    } catch {
      // Ignore parse errors from stale/corrupt cache
    }
  }

  if (publishedPosts.length === 0) {
    tilLoading.hidden = false;
    tilEmpty.hidden = true;
    tilList.innerHTML = "";
    tilPagination.hidden = true;
  }

  try {
    const res = await fetch(FIRESTORE_QUERY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "posts" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "published" },
              op: "EQUAL",
              value: { booleanValue: true },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Firestore request failed with status ${res.status}`);
    }

    const rawData = await res.json();
    const fetchedPosts = rawData
      .filter((item) => Boolean(item.document))
      .map((item) => parseFirestoreDoc(item.document));

    // Sort by createdAt descending
    fetchedPosts.sort((a, b) => {
      const timeA = getTimestampMillis(a.createdAt);
      const timeB = getTimestampMillis(b.createdAt);
      return timeB - timeA;
    });

    publishedPosts = fetchedPosts;
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(publishedPosts));
    } catch {
      // Safe to ignore quota exceeded or private mode restrictions
    }

    tilLoading.hidden = true;
    renderPosts();
    checkRoute();
  } catch (error) {
    console.error("Failed to load TIL posts:", error);
    if (publishedPosts.length === 0) {
      tilLoading.textContent = "unable to load posts.";
    }
  }
}

// Event Listeners - Navigation
backToTilButton.addEventListener("click", (e) => {
  e.preventDefault();
  history.pushState({}, "", "/til");
  showIndexView();
});

window.addEventListener("popstate", () => {
  checkRoute();
});

// Event Listeners - Pagination
tilPrevButton.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderPosts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

tilNextButton.addEventListener("click", () => {
  const totalPages = Math.ceil(publishedPosts.length / PAGE_SIZE);
  if (currentPage < totalPages) {
    currentPage++;
    renderPosts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

// Initialize
loadPublishedPosts();
