export type PrimaryNavigationTab = "games" | "feed" | "gallery" | "profile";

export function shouldFetchPrimaryTab(tab: PrimaryNavigationTab, loaded: ReadonlySet<PrimaryNavigationTab>) {
  return (tab === "games" || tab === "feed") && !loaded.has(tab);
}

export function isTabLoading(tab: PrimaryNavigationTab, loadingTab: PrimaryNavigationTab | null) {
  return loadingTab === tab;
}
