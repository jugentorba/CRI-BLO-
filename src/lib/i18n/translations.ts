// Multilingual support: French (fr), English (en), Albanian (sq)

export type Lang = "fr" | "en" | "sq";

export interface Translations {
  // Navigation
  nav_home: string;
  nav_assistant: string;
  nav_browser: string;
  nav_history: string;
  nav_settings: string;
  // Settings
  settings_title: string;
  settings_subtitle: string;
  settings_profile: string;
  settings_company: string;
  settings_technician: string;
  settings_save_profile: string;
  settings_saved: string;
  settings_language: string;
  settings_language_desc: string;
  settings_appearance: string;
  settings_theme_system: string;
  settings_theme_light: string;
  settings_theme_dark: string;
  settings_export: string;
  settings_folder_current: string;
  settings_folder_criblo: string;
  settings_folder_none: string;
  settings_folder_unsupported: string;
  settings_choose_folder: string;
  settings_change_folder: string;
  settings_photos: string;
  settings_gallery: string;
  settings_gallery_desc: string;
  settings_watermark: string;
  settings_watermark_desc: string;
  settings_cloud_sync: string;
  settings_cloud_sync_desc: string;
  settings_sign_in_google: string;
  settings_sign_in_microsoft: string;
  settings_sign_out: string;
  settings_signed_in_as: string;
  settings_guest_mode: string;
  settings_guest_desc: string;
  settings_save_cloud: string;
  settings_restore_cloud: string;
  settings_last_sync: string;
  settings_clear_cache: string;
  settings_clear_cache_desc: string;
  settings_clear_cache_confirm: string;
  settings_version: string;
  settings_ai: string;
  settings_ai_desc: string;
  settings_autosave: string;
  settings_autosave_desc: string;
  // Permissions
  perms_title: string;
  perms_subtitle: string;
  perms_location: string;
  perms_location_desc: string;
  perms_camera: string;
  perms_camera_desc: string;
  perms_files: string;
  perms_files_desc: string;
  perms_granted: string;
  perms_denied: string;
  perms_allow: string;
  perms_continue: string;
  perms_skip: string;
  // Documents
  docs_title: string;
  docs_subtitle: string;
  docs_import: string;
  docs_analysing: string;
  docs_no_docs: string;
  docs_detected_type: string;
  docs_keep_here: string;
  docs_saved: string;
  docs_open_criblo: string;
  docs_force_criblo: string;
  docs_delete: string;
  docs_edit: string;
  docs_open: string;
  // Dynamic form
  form_save: string;
  form_na: string;
  form_na_label: string;
  form_add_row: string;
  form_generated_from: string;
  form_fields_found: string;
  // Browser
  browser_address: string;
  browser_go: string;
  browser_back: string;
  browser_forward: string;
  browser_refresh: string;
  browser_bookmarks: string;
  browser_add_bookmark: string;
  browser_bookmark_added: string;
  browser_no_bookmarks: string;
  browser_downloads: string;
  browser_tabs: string;
  browser_new_tab: string;
  browser_close_tab: string;
  browser_history: string;
  // General
  cancel: string;
  confirm: string;
  close: string;
  error: string;
  loading: string;
}

const fr: Translations = {
  nav_home: "Accueil",
  nav_assistant: "Assistant",
  nav_browser: "Navigateur",
  nav_history: "Historique",
  nav_settings: "Réglages",
  settings_title: "Paramètres",
  settings_subtitle: "Profil et préférences",
  settings_profile: "Profil technicien",
  settings_company: "Entreprise",
  settings_technician: "Nom du technicien",
  settings_save_profile: "Enregistrer le profil",
  settings_saved: "Enregistré",
  settings_language: "Langue",
  settings_language_desc: "Choisissez la langue de l'application.",
  settings_appearance: "Apparence",
  settings_theme_system: "Système",
  settings_theme_light: "Clair",
  settings_theme_dark: "Sombre",
  settings_export: "Export",
  settings_folder_current: "Dossier actuel :",
  settings_folder_criblo: "Dossier CRI BLO",
  settings_folder_none:
    "Aucun dossier CRI BLO choisi. Il sera demandé au premier export puis réutilisé automatiquement.",
  settings_folder_unsupported: "Non supporté — fichiers téléchargés dans Téléchargements.",
  settings_choose_folder: "Choisir le dossier CRI BLO",
  settings_change_folder: "Changer le dossier CRI BLO",
  settings_photos: "Photos",
  settings_gallery: "Sauvegarder dans la galerie",
  settings_gallery_desc: "Télécharger chaque photo dans la galerie du téléphone.",
  settings_watermark: "Watermark",
  settings_watermark_desc: "Apposer date, heure et adresse complète sur chaque photo.",
  settings_cloud_sync: "Synchronisation cloud",
  settings_cloud_sync_desc:
    "Synchronisez vos données entre appareils via Google ou Microsoft.",
  settings_sign_in_google: "Connexion avec Google",
  settings_sign_in_microsoft: "Connexion avec Microsoft",
  settings_sign_out: "Se déconnecter",
  settings_signed_in_as: "Connecté en tant que",
  settings_guest_mode: "Mode invité",
  settings_guest_desc:
    "Toutes les fonctionnalités sont disponibles sans connexion. Vos données restent sur cet appareil.",
  settings_save_cloud: "Sauvegarder dans le cloud",
  settings_restore_cloud: "Restaurer du cloud",
  settings_last_sync: "Dernière synchro :",
  settings_clear_cache: "Vider le cache",
  settings_clear_cache_desc: "Supprime les données temporaires.",
  settings_clear_cache_confirm:
    "Vider le cache ? Les données permanentes (CRI BLO, documents) ne seront pas supprimées.",
  settings_version: "Version",
  settings_ai: "IA indépendante",
  settings_ai_desc:
    "Utilisez votre propre endpoint compatible OpenAI. Si aucun endpoint n'est configuré, l'Assistant conserve son fonctionnement existant.",
  settings_autosave: "Auto Save",
  settings_autosave_desc: "Sauvegarder automatiquement pendant l'édition.",
  perms_title: "Autorisations CRI BLO",
  perms_subtitle:
    "Autorisez les fonctions nécessaires à la première utilisation. Vous pourrez modifier ces autorisations dans les réglages du téléphone.",
  perms_location: "Localisation",
  perms_location_desc: "Nécessaire pour le GPS et le geocodage automatique.",
  perms_camera: "Caméra",
  perms_camera_desc: "Nécessaire pour les photos d'intervention.",
  perms_files: "Photos et fichiers",
  perms_files_desc: "Ouvre le sélecteur sécurisé du téléphone.",
  perms_granted: "Autorisé",
  perms_denied: "Refusé — réessayer",
  perms_allow: "Autoriser",
  perms_continue: "Continuer",
  perms_skip: "Continuer plus tard",
  docs_title: "Autres documents",
  docs_subtitle: "Historiques séparés du CRI BLO",
  docs_import: "Importer un document",
  docs_analysing: "Analyse en cours…",
  docs_no_docs:
    "Aucun autre document enregistré. Les documents importés qui ne sont pas des CRI BLO apparaîtront ici.",
  docs_detected_type: "Type détecté :",
  docs_keep_here: "Conserver dans Autres documents",
  docs_saved: "Enregistré dans Autres documents",
  docs_open_criblo: "Ouvrir dans le module CRI BLO",
  docs_force_criblo: "Traiter quand même comme CRI BLO",
  docs_delete: "Supprimer",
  docs_edit: "Modifier",
  docs_open: "Ouvrir",
  form_save: "Enregistrer sous…",
  form_na: "N/A",
  form_na_label: "Non applicable",
  form_add_row: "Ajouter une ligne",
  form_generated_from: "Formulaire généré depuis",
  form_fields_found: "champ(s) détecté(s)",
  browser_address: "Adresse ou recherche…",
  browser_go: "Aller",
  browser_back: "Précédent",
  browser_forward: "Suivant",
  browser_refresh: "Actualiser",
  browser_bookmarks: "Favoris",
  browser_add_bookmark: "Ajouter aux favoris",
  browser_bookmark_added: "Ajouté aux favoris",
  browser_no_bookmarks: "Aucun favori",
  browser_downloads: "Téléchargements",
  browser_tabs: "Onglets",
  browser_new_tab: "Nouvel onglet",
  browser_close_tab: "Fermer l'onglet",
  browser_history: "Historique",
  cancel: "Annuler",
  confirm: "Confirmer",
  close: "Fermer",
  error: "Erreur",
  loading: "Chargement…",
};

const en: Translations = {
  nav_home: "Home",
  nav_assistant: "Assistant",
  nav_browser: "Browser",
  nav_history: "History",
  nav_settings: "Settings",
  settings_title: "Settings",
  settings_subtitle: "Profile & preferences",
  settings_profile: "Technician profile",
  settings_company: "Company",
  settings_technician: "Technician name",
  settings_save_profile: "Save profile",
  settings_saved: "Saved",
  settings_language: "Language",
  settings_language_desc: "Choose the application language.",
  settings_appearance: "Appearance",
  settings_theme_system: "System",
  settings_theme_light: "Light",
  settings_theme_dark: "Dark",
  settings_export: "Export",
  settings_folder_current: "Current folder:",
  settings_folder_criblo: "CRI BLO Folder",
  settings_folder_none:
    "No CRI BLO folder selected. It will be requested on first export then reused automatically.",
  settings_folder_unsupported: "Not supported — files downloaded to Downloads folder.",
  settings_choose_folder: "Choose CRI BLO folder",
  settings_change_folder: "Change CRI BLO folder",
  settings_photos: "Photos",
  settings_gallery: "Save to gallery",
  settings_gallery_desc: "Download each photo to the phone gallery.",
  settings_watermark: "Watermark",
  settings_watermark_desc: "Stamp date, time and full address on each photo.",
  settings_cloud_sync: "Cloud synchronization",
  settings_cloud_sync_desc: "Sync your data between devices via Google or Microsoft.",
  settings_sign_in_google: "Sign in with Google",
  settings_sign_in_microsoft: "Sign in with Microsoft",
  settings_sign_out: "Sign out",
  settings_signed_in_as: "Signed in as",
  settings_guest_mode: "Guest mode",
  settings_guest_desc:
    "All features available without signing in. Your data stays on this device.",
  settings_save_cloud: "Save to cloud",
  settings_restore_cloud: "Restore from cloud",
  settings_last_sync: "Last sync:",
  settings_clear_cache: "Clear cache",
  settings_clear_cache_desc: "Deletes temporary data.",
  settings_clear_cache_confirm:
    "Clear cache? Permanent data (CRI BLO, documents) will not be deleted.",
  settings_version: "Version",
  settings_ai: "Independent AI",
  settings_ai_desc:
    "Use your own OpenAI-compatible endpoint. If no endpoint is configured, the Assistant keeps its existing behaviour.",
  settings_autosave: "Auto Save",
  settings_autosave_desc: "Automatically save while editing.",
  perms_title: "CRI BLO Permissions",
  perms_subtitle:
    "Grant the required permissions on first use. You can change them later in your phone settings.",
  perms_location: "Location",
  perms_location_desc: "Required for GPS and automatic geocoding.",
  perms_camera: "Camera",
  perms_camera_desc: "Required for intervention photos.",
  perms_files: "Photos & files",
  perms_files_desc: "Opens the secure file picker.",
  perms_granted: "Granted",
  perms_denied: "Denied — retry",
  perms_allow: "Allow",
  perms_continue: "Continue",
  perms_skip: "Continue later",
  docs_title: "Other documents",
  docs_subtitle: "Separate history from CRI BLO",
  docs_import: "Import a document",
  docs_analysing: "Analysing…",
  docs_no_docs:
    "No other documents saved. Imported documents that are not CRI BLO will appear here.",
  docs_detected_type: "Detected type:",
  docs_keep_here: "Keep in Other documents",
  docs_saved: "Saved in Other documents",
  docs_open_criblo: "Open in CRI BLO module",
  docs_force_criblo: "Treat as CRI BLO anyway",
  docs_delete: "Delete",
  docs_edit: "Edit",
  docs_open: "Open",
  form_save: "Save as…",
  form_na: "N/A",
  form_na_label: "Not applicable",
  form_add_row: "Add row",
  form_generated_from: "Form generated from",
  form_fields_found: "field(s) detected",
  browser_address: "Address or search…",
  browser_go: "Go",
  browser_back: "Back",
  browser_forward: "Forward",
  browser_refresh: "Refresh",
  browser_bookmarks: "Bookmarks",
  browser_add_bookmark: "Add bookmark",
  browser_bookmark_added: "Bookmark added",
  browser_no_bookmarks: "No bookmarks",
  browser_downloads: "Downloads",
  browser_tabs: "Tabs",
  browser_new_tab: "New tab",
  browser_close_tab: "Close tab",
  browser_history: "History",
  cancel: "Cancel",
  confirm: "Confirm",
  close: "Close",
  error: "Error",
  loading: "Loading…",
};

const sq: Translations = {
  nav_home: "Kryefaqja",
  nav_assistant: "Asistenti",
  nav_browser: "Shfletuesi",
  nav_history: "Historia",
  nav_settings: "Cilësimet",
  settings_title: "Cilësimet",
  settings_subtitle: "Profili dhe preferencat",
  settings_profile: "Profili i teknikut",
  settings_company: "Kompania",
  settings_technician: "Emri i teknikut",
  settings_save_profile: "Ruaj profilin",
  settings_saved: "U ruajt",
  settings_language: "Gjuha",
  settings_language_desc: "Zgjidhni gjuhën e aplikacionit.",
  settings_appearance: "Pamja",
  settings_theme_system: "Sistemi",
  settings_theme_light: "E çelët",
  settings_theme_dark: "E errët",
  settings_export: "Eksporto",
  settings_folder_current: "Dosja aktuale:",
  settings_folder_criblo: "Dosja CRI BLO",
  settings_folder_none:
    "Nuk është zgjedhur asnjë dosje CRI BLO. Do të kërkohet në eksportimin e parë.",
  settings_folder_unsupported:
    "Nuk mbështetet — skedarët shkarkohen në dosjen Shkarkimet.",
  settings_choose_folder: "Zgjidhni dosjen CRI BLO",
  settings_change_folder: "Ndrysho dosjen CRI BLO",
  settings_photos: "Fotografitë",
  settings_gallery: "Ruaj në galeri",
  settings_gallery_desc: "Shkarko çdo foto në galerinë e telefonit.",
  settings_watermark: "Filigran",
  settings_watermark_desc: "Shtyp datën, orën dhe adresën e plotë mbi çdo foto.",
  settings_cloud_sync: "Sinkronizimi cloud",
  settings_cloud_sync_desc:
    "Sinkronizoni të dhënat tuaja midis pajisjeve nëpërmjet Google ose Microsoft.",
  settings_sign_in_google: "Hyrja me Google",
  settings_sign_in_microsoft: "Hyrja me Microsoft",
  settings_sign_out: "Dilni",
  settings_signed_in_as: "I kyçur si",
  settings_guest_mode: "Mënyra mysafir",
  settings_guest_desc:
    "Të gjitha funksionet disponohen pa hyrje. Të dhënat tuaja qëndrojnë në këtë pajisje.",
  settings_save_cloud: "Ruaj në cloud",
  settings_restore_cloud: "Riktheje nga cloud",
  settings_last_sync: "Sinkronizimi i fundit:",
  settings_clear_cache: "Pastro cache",
  settings_clear_cache_desc: "Fshin të dhënat e përkohshme.",
  settings_clear_cache_confirm:
    "Pastro cache? Të dhënat e përhershme (CRI BLO, dokumentet) nuk do të fshihen.",
  settings_version: "Versioni",
  settings_ai: "AI i pavarur",
  settings_ai_desc:
    "Përdorni endpoint-in tuaj të pajtueshëm me OpenAI. Nëse nuk është konfiguruar, Asistenti ruan sjelljen ekzistuese.",
  settings_autosave: "Ruajtje automatike",
  settings_autosave_desc: "Ruaj automatikisht gjatë redaktimit.",
  perms_title: "Lejet CRI BLO",
  perms_subtitle:
    "Jepni lejet e nevojshme në përdorimin e parë. Mund t'i ndryshoni më vonë në cilësimet e telefonit.",
  perms_location: "Vendndodhja",
  perms_location_desc: "E nevojshme për GPS dhe geocodim automatik.",
  perms_camera: "Kamera",
  perms_camera_desc: "E nevojshme për fotografitë e ndërhyrjes.",
  perms_files: "Fotografitë dhe skedarët",
  perms_files_desc: "Hap zgjedhësin e sigurt të skedarëve.",
  perms_granted: "Lejuar",
  perms_denied: "Refuzuar — riprovoni",
  perms_allow: "Lejoni",
  perms_continue: "Vazhdo",
  perms_skip: "Vazhdo më vonë",
  docs_title: "Dokumente të tjera",
  docs_subtitle: "Histori e veçuar nga CRI BLO",
  docs_import: "Importo dokument",
  docs_analysing: "Analizim…",
  docs_no_docs:
    "Nuk ka dokumente të tjera të ruajtura. Dokumentet e importuara që nuk janë CRI BLO do të shfaqen këtu.",
  docs_detected_type: "Lloji i zbuluar:",
  docs_keep_here: "Mbaje në Dokumente të tjera",
  docs_saved: "U ruajt në Dokumente të tjera",
  docs_open_criblo: "Hap në modulin CRI BLO",
  docs_force_criblo: "Trajtoje si CRI BLO gjithsesi",
  docs_delete: "Fshi",
  docs_edit: "Redakto",
  docs_open: "Hap",
  form_save: "Ruaj si…",
  form_na: "N/A",
  form_na_label: "Nuk aplikohet",
  form_add_row: "Shto rresht",
  form_generated_from: "Formular i gjeneruar nga",
  form_fields_found: "fushë(a) e zbuluar(a)",
  browser_address: "Adresa ose kërkimi…",
  browser_go: "Shko",
  browser_back: "Kthehu",
  browser_forward: "Para",
  browser_refresh: "Rifresko",
  browser_bookmarks: "Të preferuarat",
  browser_add_bookmark: "Shto te të preferuarat",
  browser_bookmark_added: "U shtua te të preferuarat",
  browser_no_bookmarks: "Asnjë e preferuar",
  browser_downloads: "Shkarkimet",
  browser_tabs: "Skeda",
  browser_new_tab: "Skedë e re",
  browser_close_tab: "Mbyll skedën",
  browser_history: "Historia",
  cancel: "Anulo",
  confirm: "Konfirmo",
  close: "Mbyll",
  error: "Gabim",
  loading: "Duke ngarkuar…",
};

export const TRANSLATIONS: Record<Lang, Translations> = { fr, en, sq };

/** Detect the best available language from browser preferences. */
export function detectSystemLang(): Lang {
  const langs = navigator.languages ?? [navigator.language ?? "fr"];
  for (const l of langs) {
    const code = l.split("-")[0].toLowerCase();
    if (code === "sq" || code === "sqi") return "sq";
    if (code === "en") return "en";
    if (code === "fr") return "fr";
  }
  return "fr";
}
