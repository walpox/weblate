// Copyright © Michal Čihař <michal@weblate.org>
//
// SPDX-License-Identifier: GPL-3.0-or-later

// biome-ignore lint/style/noVar: TODO: doesn't work without that
// biome-ignore lint/correctness/noInvalidUseBeforeDeclaration: TODO: doesn't work without that
var WLT = WLT || {};

WLT.Config = (() => ({
  IS_MAC: /Mac|iPod|iPhone|iPad/.test(navigator.platform),
}))();

WLT.Utils = (() => ({
  getNumericKey: (idx) => (idx + 1) % 10,

  markFuzzy: ($el) => {
    /* Standard workflow */
    $el.find('input[name="fuzzy"]').prop("checked", true);
    /* Review workflow */
    $el.find('input[name="review"][value="10"]').prop("checked", true);
  },

  markTranslated: ($el) => {
    /* Standard workflow */
    $el.find('input[name="fuzzy"]').prop("checked", false);
    /* Review workflow */
    $el.find('input[name="review"][value="20"]').prop("checked", true);
  },
}))();

WLT.Editor = (() => {
  let lastEditor = null;
  let hasChanges = false;

  function EditorBase() {
    const translationAreaSelector = ".translation-editor";

    this.$editor = $(".js-editor");
    /* Only insert actual translation editor, not a popup for adding variant */
    this.$translationArea = $(".translator .translation-editor");

    this.$editor.on("input", translationAreaSelector, (e) => {
      WLT.Utils.markTranslated($(e.target).closest("form"));
      hasChanges = true;
    });

    this.$editor.on("focusin", translationAreaSelector, function () {
      lastEditor = $(this);
    });

    /* Count characters */
    this.$editor.on("input", translationAreaSelector, (e) => {
      const textarea = e.target;
      const editor = textarea.parentElement.parentElement;
      const counter = editor.querySelector(".length-indicator");
      const classToggle = editor.classList;

      const limit = Number.parseInt(counter.getAttribute("data-max"));
      const length = textarea.value.length;

      counter.textContent = length;
      if (length > limit) {
        classToggle.remove("has-warning");
        classToggle.add("has-error");
      } else if (length > limit - 10) {
        classToggle.add("has-warning");
        classToggle.remove("has-error");
      } else {
        classToggle.remove("has-warning");
        classToggle.remove("has-error");
      }
    });

    /* Copy source text */
    this.$editor.on("click", "[data-clone-value]", function (_e) {
      const $this = $(this);
      const $document = $(document);
      const cloneText = this.getAttribute("data-clone-value");

      let row = $this.closest(".zen-unit");
      if (row.length === 0) {
        row = $this.closest(".translator");
      }
      if (row.length === 0) {
        row = $document.find(".translator");
      }
      const editors = row.find(".translation-editor");
      if (editors.length === 1) {
        editors.replaceValue(cloneText);
      } else {
        addAlert(gettext("Please select target plural by clicking."), "info");
        editors.addClass("editor-click-select");
        editors.click(function () {
          $(this).replaceValue(cloneText);
          editors.removeClass("editor-click-select");
          editors.off("click");
          $document.off("click");
          return false;
        });
        $document.on("click", () => {
          editors.removeClass("editor-click-select");
          editors.off("click");
          $document.off("click");
          return false;
        });
      }
      WLT.Utils.markFuzzy($this.closest("form"));
      hasChanges = true;
      return false;
    });

    /* Direction toggling */
    this.$editor.on("change", ".direction-toggle", function () {
      const $this = $(this);
      const direction = $this.find("input").val();
      const container = $this.closest(".translation-item");

      container.find(".translation-editor").attr("dir", direction);
      container.find(".highlighted-output").attr("dir", direction);
      hasChanges = true;
    });

    /* Special characters */
    this.$editor.on("click", ".specialchar", function (e) {
      const $this = $(this);
      const text = this.getAttribute("data-value");

      $this
        .closest(".translation-item")
        .find(".translation-editor")
        .insertAtCaret(text);
      e.preventDefault();
      hasChanges = true;
    });

    this.initHighlight();
    this.init();

    this.$translationArea[0].focus();

    // Skip confirmation
    this.$editor.on("click", ".skip", (_e) => {
      if (hasChanges) {
        return confirm(
          gettext("You have unsaved changes. Are you sure you want to skip?"),
        );
      }
    });
  }

  EditorBase.prototype.init = () => {};

  EditorBase.prototype.initHighlight = function () {
    const hlSelector = ".hlcheck";
    const hlNumberSelector = ".highlight-number";

    /* Copy from source text highlight check */
    this.$editor.on("click", hlSelector, function (e) {
      const $this = $(this);
      insertEditor(this.getAttribute("data-value"), $this);
      e.preventDefault();
      hasChanges = true;
    });

    /* and shortcuts */
    for (let i = 1; i < 10; i++) {
      Mousetrap.bindGlobal(`mod+${i}`, (_e) => false);
    }

    const $hlCheck = $(hlSelector);
    if ($hlCheck.length > 0) {
      $hlCheck.each(function (idx) {
        const $this = $(this);

        if (idx < 10) {
          const key = WLT.Utils.getNumericKey(idx);

          let title;
          if (WLT.Config.IS_MAC) {
            title = interpolate(gettext("Cmd+%s"), [key]);
          } else {
            title = interpolate(gettext("Ctrl+%s"), [key]);
          }
          $this.attr("title", title);
          $this.find(hlNumberSelector).html($("<kbd/>").text(key));

          Mousetrap.bindGlobal(`mod+${key}`, (_e) => {
            $this.click();
            return false;
          });
        } else {
          $this.find(hlNumberSelector).html("");
        }
      });
      $(hlNumberSelector).hide();
    }

    Mousetrap.bindGlobal(
      "mod",
      (_e) => {
        $(hlNumberSelector).show();
      },
      "keydown",
    );
    Mousetrap.bindGlobal(
      "mod",
      (_e) => {
        $(hlNumberSelector).hide();
      },
      "keyup",
    );
  };

  function insertEditor(text, element) {
    let root;

    /* Find within root element */
    if (typeof element !== "undefined") {
      root = element.closest(".zen-unit");
      if (root.length === 0) {
        root = element.closest(".translation-form");
      }
      if (root.length === 0) {
        root = $(document);
      }
    } else {
      root = $(document);
    }

    let editor = root.find(".translation-editor:focus");
    if (editor.length === 0) {
      editor = root.find(lastEditor);
      if (editor.length === 0) {
        editor = root.find(".translation-editor:first");
      }
    }

    editor.insertAtCaret(text);
  }

  return {
    Base: EditorBase,
  };
})();
