import { auth, db } from "./firebase.js";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import BubbleMenu from "@tiptap/extension-bubble-menu";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";

const ADMIN_UID = "EyGCqsjj3jgKFsCjzLbU36Eo4rT2";

// DOM Elements - Auth & Sections
const signInSection = document.getElementById("sign-in");
const unauthorizedSection = document.getElementById("unauthorized");
const adminPanel = document.getElementById("admin-panel");
const authControls = document.getElementById("auth-controls");
const signInButton = document.getElementById("sign-in-button");
const signOutButton = document.getElementById("sign-out-button");
const unauthorizedSignOutButton = document.getElementById("unauthorized-sign-out-button");

// DOM Elements - Header Navigation
const navIndex = document.getElementById("nav-index");
const navPosts = document.getElementById("nav-posts");
const backToPostsButton = document.getElementById("back-to-posts-button");

// DOM Elements - Posts View
const postsView = document.getElementById("posts-view");
const postsList = document.getElementById("posts-list");
const postsCount = document.getElementById("posts-count");
const postsLoading = document.getElementById("posts-loading");
const postsEmpty = document.getElementById("posts-empty");
const newPostButton = document.getElementById("new-post-button");
const postsPagination = document.getElementById("posts-pagination");
const prevPageButton = document.getElementById("prev-page-button");
const nextPageButton = document.getElementById("next-page-button");
const paginationInfo = document.getElementById("pagination-info");

// DOM Elements - Editor View
const editorView = document.getElementById("editor-view");
const postTitleInput = document.getElementById("post-title");
const postSlugPreview = document.getElementById("post-slug-preview");
const editorSaveStatus = document.getElementById("editor-save-status");
const saveDraftButton = document.getElementById("save-draft-button");
const publishPostButton = document.getElementById("publish-post-button");
const deletePostButton = document.getElementById("delete-post-button");
const bubbleMenuEl = document.getElementById("bubble-menu");

// DOM Elements - Confirmation Dialog
const confirmDialog = document.getElementById("confirm-dialog");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmOkBtn = document.getElementById("confirm-ok-btn");

// State
let editorInstance = null;
let currentEditingPostId = null;
let currentCustomSlug = null;
let cachedPosts = [];
const PAGE_SIZE = 10;
let currentPage = 1;

// Slug generator
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Date formatter
function formatDate(timestamp) {
  if (!timestamp) return "just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Initialize Tiptap
function initEditor() {
  if (editorInstance) return editorInstance;

  // Detach and hide bubble menu until a text selection occurs
  bubbleMenuEl.style.visibility = "hidden";
  bubbleMenuEl.style.opacity = "0";
  bubbleMenuEl.remove();

  editorInstance = new Editor({
    element: document.getElementById("tiptap-editor"),
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder: "write something worth learning...",
      }),
      Markdown,
      BubbleMenu.configure({
        element: bubbleMenuEl,
        updateDelay: 0,
        options: {
          onHide() {
            bubbleMenuEl.style.removeProperty("left");
            bubbleMenuEl.style.removeProperty("top");
            resetLinkForm();
          },
        },
      }),
    ],
    content: "",
    onTransaction({ editor }) {
      updateBubbleMenuButtons(editor);
    },
  });

  setupBubbleMenuEvents(editorInstance);
  return editorInstance;
}

// Update Bubble Menu active states
function updateBubbleMenuButtons(editor) {
  const buttons = bubbleMenuEl.querySelectorAll("button[data-action]");
  buttons.forEach((btn) => {
    const action = btn.dataset.action;
    const level = btn.dataset.level ? parseInt(btn.dataset.level, 10) : undefined;
    let isActive = false;

    if (action === "heading") {
      isActive = editor.isActive("heading", { level });
    } else if (action === "bold") {
      isActive = editor.isActive("bold");
    } else if (action === "italic") {
      isActive = editor.isActive("italic");
    } else if (action === "code") {
      isActive = editor.isActive("code");
    } else if (action === "blockquote") {
      isActive = editor.isActive("blockquote");
    } else if (action === "link") {
      isActive = editor.isActive("link");
    }

    btn.classList.toggle("is-active", isActive);
  });
}

// Bubble Menu Events & Inline Link Form
let resetLinkForm = () => {};

function setupBubbleMenuEvents(editor) {
  const formattingRow = bubbleMenuEl.querySelector("#bubble-menu-formatting");
  const linkBox = bubbleMenuEl.querySelector("#bubble-menu-link-box");
  const linkInput = bubbleMenuEl.querySelector("#bubble-link-input");
  const linkSaveBtn = bubbleMenuEl.querySelector("#bubble-link-save-btn");
  const linkUnlinkBtn = bubbleMenuEl.querySelector("#bubble-link-unlink-btn");
  const linkCancelBtn = bubbleMenuEl.querySelector("#bubble-link-cancel-btn");

  resetLinkForm = () => {
    if (linkBox) linkBox.hidden = true;
    if (formattingRow) formattingRow.hidden = false;
    if (linkInput) linkInput.value = "";
  };

  function openLinkForm() {
    const isLinkActive = editor.isActive("link");
    const currentHref = isLinkActive ? (editor.getAttributes("link").href || "") : "";
    linkInput.value = currentHref;
    linkUnlinkBtn.hidden = !isLinkActive;

    formattingRow.hidden = true;
    linkBox.hidden = false;
    setTimeout(() => {
      linkInput.focus();
      linkInput.select();
    }, 10);
  }

  function applyLink() {
    let url = linkInput.value.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      if (!/^https?:\/\/|^\/|^mailto:/.test(url)) {
        url = "https://" + url;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    resetLinkForm();
  }

  // Formatting buttons click
  formattingRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const level = btn.dataset.level ? parseInt(btn.dataset.level, 10) : undefined;

    if (action === "bold") {
      editor.chain().focus().toggleBold().run();
    } else if (action === "italic") {
      editor.chain().focus().toggleItalic().run();
    } else if (action === "heading") {
      editor.chain().focus().toggleHeading({ level }).run();
    } else if (action === "blockquote") {
      editor.chain().focus().toggleBlockquote().run();
    } else if (action === "code") {
      editor.chain().focus().toggleCode().run();
    } else if (action === "link") {
      openLinkForm();
    }
  });

  // Apply Link button
  linkSaveBtn.addEventListener("click", applyLink);

  // Remove Link button
  linkUnlinkBtn.addEventListener("click", () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    resetLinkForm();
  });

  // Cancel Link button
  linkCancelBtn.addEventListener("click", () => {
    resetLinkForm();
    editor.commands.focus();
  });

  // Enter to apply, Escape to cancel
  linkInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyLink();
    } else if (e.key === "Escape") {
      e.preventDefault();
      resetLinkForm();
      editor.commands.focus();
    }
  });
}

// Navigation between views
function showPostsView() {
  postsView.hidden = false;
  editorView.hidden = true;
  navIndex.hidden = false;
  navPosts.hidden = true;
  editorSaveStatus.textContent = "";
  loadPosts();
}

function showEditorView(post = null) {
  initEditor();
  postsView.hidden = true;
  editorView.hidden = false;
  navIndex.hidden = true;
  navPosts.hidden = false;
  editorSaveStatus.textContent = "";

  if (post) {
    currentEditingPostId = post.id;
    currentCustomSlug = post.slug || generateSlug(post.title || "");
    postTitleInput.value = post.title || "";
    postSlugPreview.textContent = currentCustomSlug;
    deletePostButton.hidden = false;
    editorInstance.commands.setContent(post.content || "");

    if (post.published) {
      publishPostButton.textContent = "update";
      saveDraftButton.textContent = "unpublish";
    } else {
      publishPostButton.textContent = "publish";
      saveDraftButton.textContent = "save draft";
    }
  } else {
    currentEditingPostId = null;
    currentCustomSlug = null;
    postTitleInput.value = "";
    postSlugPreview.textContent = "";
    deletePostButton.hidden = true;
    editorInstance.commands.setContent("");
    publishPostButton.textContent = "publish";
    saveDraftButton.textContent = "save draft";
  }

  postTitleInput.focus();
}

// Slug preview on title change
postTitleInput.addEventListener("input", () => {
  if (!currentCustomSlug || !currentEditingPostId) {
    postSlugPreview.textContent = generateSlug(postTitleInput.value);
  }
});

// Render posts with pagination
function renderPosts() {
  postsList.innerHTML = "";

  if (cachedPosts.length === 0) {
    postsEmpty.hidden = false;
    postsPagination.hidden = true;
    postsCount.textContent = "0";
    return;
  }

  postsEmpty.hidden = true;
  postsCount.textContent = cachedPosts.length.toString();

  const totalPages = Math.ceil(cachedPosts.length / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pagePosts = cachedPosts.slice(startIdx, startIdx + PAGE_SIZE);

  pagePosts.forEach((post) => {
    const li = document.createElement("li");
    li.className = "post-item";

    const isPublished = Boolean(post.published);

    li.innerHTML = `
      <div class="post-item-info">
        <div class="post-item-title-row">
          <a href="#" class="post-item-title">${escapeHtml(post.title || "untitled")}</a>
          <span class="badge ${isPublished ? "badge-published" : ""}">${isPublished ? "published" : "draft"}</span>
        </div>
        <div class="post-item-meta">
          <span class="post-date">${formatDate(post.createdAt)}</span>
          ${post.slug ? `<span class="footer-divider">·</span><span class="post-slug">/til/${escapeHtml(post.slug)}</span>` : ""}
        </div>
      </div>
      <div class="post-item-actions">
        <button type="button" class="post-action-btn edit-btn">edit</button>
        <button type="button" class="post-action-btn btn-danger delete-btn">delete</button>
      </div>
    `;

    li.querySelector(".post-item-title").addEventListener("click", (e) => {
      e.preventDefault();
      showEditorView(post);
    });

    li.querySelector(".edit-btn").addEventListener("click", () => {
      showEditorView(post);
    });

    li.querySelector(".delete-btn").addEventListener("click", () => {
      handleDeletePost(post.id, post.title);
    });

    postsList.appendChild(li);
  });

  if (cachedPosts.length > PAGE_SIZE) {
    postsPagination.hidden = false;
    paginationInfo.textContent = `page ${currentPage} of ${totalPages}`;
    prevPageButton.disabled = currentPage <= 1;
    nextPageButton.disabled = currentPage >= totalPages;
  } else {
    postsPagination.hidden = true;
  }
}

// Fetch posts from Firestore
async function loadPosts() {
  postsLoading.hidden = false;
  postsEmpty.hidden = true;
  postsList.innerHTML = "";
  postsPagination.hidden = true;

  try {
    const snap = await getDocs(collection(db, "posts"));
    cachedPosts = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    // Sort by createdAt descending
    cachedPosts.sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeB - timeA;
    });

    postsLoading.hidden = true;
    renderPosts();
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    postsLoading.textContent = "failed to load posts.";
  }
}

// Custom confirmation modal helper
function showConfirmDialog({ title, message, confirmText = "confirm", isDanger = false }) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmText;
    confirmOkBtn.className = isDanger ? "btn-danger" : "";

    const handleConfirm = () => {
      cleanup();
      confirmDialog.close();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      confirmDialog.close();
      resolve(false);
    };

    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    };

    function cleanup() {
      confirmOkBtn.removeEventListener("click", handleConfirm);
      confirmCancelBtn.removeEventListener("click", handleCancel);
      confirmDialog.removeEventListener("keydown", handleKeydown);
    }

    confirmOkBtn.addEventListener("click", handleConfirm, { once: true });
    confirmCancelBtn.addEventListener("click", handleCancel, { once: true });
    confirmDialog.addEventListener("keydown", handleKeydown, { once: true });

    confirmDialog.showModal();
    confirmOkBtn.focus();
  });
}

// Save post to Firestore
async function handleSavePost(isPublishing) {
  const title = postTitleInput.value.trim();
  if (!title) {
    alert("Please provide a post title.");
    postTitleInput.focus();
    return;
  }

  if (isPublishing) {
    const isUpdate = currentEditingPostId && cachedPosts.find((p) => p.id === currentEditingPostId)?.published;
    const confirmed = await showConfirmDialog({
      title: isUpdate ? "update post" : "publish post",
      message: `are you sure you want to ${isUpdate ? "update" : "publish"} "${title}"? it will be visible on your site.`,
      confirmText: isUpdate ? "update" : "publish",
      isDanger: false,
    });
    if (!confirmed) return;
  }

  const slug = currentCustomSlug || generateSlug(title);
  const content = editorInstance ? editorInstance.storage.markdown.getMarkdown() : "";
  const published = Boolean(isPublishing);

  saveDraftButton.disabled = true;
  publishPostButton.disabled = true;
  editorSaveStatus.textContent = "saving...";

  try {
    if (currentEditingPostId) {
      await updateDoc(doc(db, "posts", currentEditingPostId), {
        title,
        slug,
        content,
        published,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "posts"), {
        title,
        slug,
        content,
        published,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    editorSaveStatus.textContent = isPublishing ? "published!" : "saved draft!";
    setTimeout(() => {
      showPostsView();
    }, 400);
  } catch (error) {
    console.error("Error saving post:", error);
    editorSaveStatus.textContent = "save error!";
    alert("Could not save post: " + (error.message || error));
  } finally {
    saveDraftButton.disabled = false;
    publishPostButton.disabled = false;
  }
}

// Delete post from Firestore
async function handleDeletePost(postId, postTitle) {
  const confirmed = await showConfirmDialog({
    title: "delete post",
    message: `are you sure you want to delete "${postTitle || "this post"}"? this cannot be undone.`,
    confirmText: "delete",
    isDanger: true,
  });
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "posts", postId));
    if (currentEditingPostId === postId) {
      showPostsView();
    } else {
      loadPosts();
    }
  } catch (error) {
    console.error("Failed to delete post:", error);
    alert("Could not delete post: " + (error.message || error));
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Event Listeners - Navigation & Actions
newPostButton.addEventListener("click", () => showEditorView(null));
backToPostsButton.addEventListener("click", (e) => {
  e.preventDefault();
  showPostsView();
});

saveDraftButton.addEventListener("click", () => handleSavePost(false));
publishPostButton.addEventListener("click", () => handleSavePost(true));

deletePostButton.addEventListener("click", () => {
  if (currentEditingPostId) {
    const post = cachedPosts.find((p) => p.id === currentEditingPostId);
    handleDeletePost(currentEditingPostId, post?.title || postTitleInput.value);
  }
});

// Event Listeners - Pagination
prevPageButton.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderPosts();
  }
});

nextPageButton.addEventListener("click", () => {
  const totalPages = Math.ceil(cachedPosts.length / PAGE_SIZE);
  if (currentPage < totalPages) {
    currentPage++;
    renderPosts();
  }
});

// Event Listeners - Auth
signInButton.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      console.error("Sign-in error:", error);
    }
  }
});

signOutButton.addEventListener("click", () => signOut(auth));
unauthorizedSignOutButton.addEventListener("click", () => signOut(auth));

// Auth state observer
onAuthStateChanged(auth, (user) => {
  const isAdmin = user?.uid === ADMIN_UID;

  signInSection.hidden = Boolean(user);
  unauthorizedSection.hidden = !user || isAdmin;
  authControls.hidden = !isAdmin;
  adminPanel.hidden = !isAdmin;

  if (isAdmin) {
    showPostsView();
  }
});
