import { db } from "./firebase.js";
import { collection, getDocs, query, where } from "firebase/firestore";
import { marked } from "marked";

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
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

// Fetch published posts from Firestore
async function loadPublishedPosts() {
  tilLoading.hidden = false;
  tilEmpty.hidden = true;
  tilList.innerHTML = "";
  tilPagination.hidden = true;

  try {
    const q = query(
      collection(db, "posts"),
      where("published", "==", true)
    );

    const snapshot = await getDocs(q);
    publishedPosts = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    // Client-side sort by createdAt descending
    publishedPosts.sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeB - timeA;
    });

    tilLoading.hidden = true;
    renderPosts();
    checkRoute();
  } catch (error) {
    console.error("Failed to load TIL posts:", error);
    tilLoading.textContent = "unable to load posts.";
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
