const WHATSAPP_NUMBER = "5511934045680";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

async function loadComponent(selector, path) {
  const element = document.querySelector(selector);
  if (!element) return;

  try {
    const response = await fetch(path);

    if (!response.ok) {
      throw new Error(`Erro ao carregar ${path}: ${response.status}`);
    }

    const html = await response.text();
    element.innerHTML = html;
  } catch (error) {
    console.error(error);
  }
}

function trocarImagem(idImagemPrincipal, src) {
  const imagemPrincipal = document.getElementById(idImagemPrincipal);
  if (!imagemPrincipal) return;
  imagemPrincipal.src = src;
}
document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("modalPersonalizacao");
  const fecharModal = document.getElementById("fecharModalPersonalizacao");
  const titulo = document.getElementById("modalPersonalizacaoTitulo");
  const texto = document.getElementById("modalPersonalizacaoTexto");
  const lista = document.getElementById("modalPersonalizacaoLista");
  const botoes = document.querySelectorAll(".btn-personalizacao");

  function abrirModal(botao) {
    const modalTitle = botao.getAttribute("data-modal-title") || "Opções de personalização";
    const modalText = botao.getAttribute("data-modal-text") || "";
    const modalList = botao.getAttribute("data-modal-list") || "";

    titulo.textContent = modalTitle;
    texto.textContent = modalText;

    lista.innerHTML = "";

    if (modalList.trim() !== "") {
      const itens = modalList.split(";");
      itens.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item.trim();
        lista.appendChild(li);
      });
    }

    modal.classList.add("ativo");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function fecharModalFunc() {
    modal.classList.remove("ativo");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  botoes.forEach(botao => {
    botao.addEventListener("click", function () {
      abrirModal(botao);
    });
  });

  fecharModal.addEventListener("click", fecharModalFunc);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) {
      fecharModalFunc();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("ativo")) {
      fecharModalFunc();
    }
  });
});
function initMobileMenu() {
  const menuToggle = document.getElementById("menu-toggle");
  const siteNav = document.getElementById("site-nav");

  if (!menuToggle || !siteNav) return;

  menuToggle.addEventListener("click", () => {
    siteNav.classList.toggle("active");
  });
}

function initWhatsAppLinks() {
  const whatsappLinks = document.querySelectorAll("[data-whatsapp]");

  whatsappLinks.forEach(link => {
    link.setAttribute("href", WHATSAPP_LINK);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });
}

async function initComponents() {
  await loadComponent("#site-header", "assets/components/header.html");
  await loadComponent("#site-footer", "assets/components/footer.html");

  initMobileMenu();
  initWhatsAppLinks();
}

document.addEventListener("DOMContentLoaded", async () => {
  await initComponents();
  initWhatsAppLinks();
});
