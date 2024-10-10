/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.groups.enabled", true]],
  });
});

async function removeTabGroup(group) {
  if (!group.parentNode) {
    ok(false, "group was already removed");
    return;
  }
  let removePromise = BrowserTestUtils.waitForEvent(group, "TabGroupRemove");
  group.ownerGlobal.gBrowser.removeTabGroup(group, { animate: false });
  await removePromise;
}

add_task(async function test_tabGroupCreateAndAddTab() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup("blue", "test", [tab1]);

  Assert.ok(group.id, "group has id");
  Assert.ok(group.tabs.includes(tab1), "tab1 is in group");

  let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  group.addTabs([tab2]);

  Assert.equal(group.tabs.length, 2, "group has 2 tabs");
  Assert.ok(group.tabs.includes(tab2), "tab1 is in group");

  await removeTabGroup(group);
});

add_task(async function test_getTabGroups() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group1 = gBrowser.addTabGroup("blue", "test1", [tab1]);
  Assert.equal(
    gBrowser.tabGroups.length,
    1,
    "there is one group in the tabstrip"
  );

  let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group2 = gBrowser.addTabGroup("red", "test2", [tab2]);
  Assert.equal(
    gBrowser.tabGroups.length,
    2,
    "there are two groups in the tabstrip"
  );

  await removeTabGroup(group1);
  await removeTabGroup(group2);
  Assert.equal(
    gBrowser.tabGroups.length,
    0,
    "there are no groups in the tabstrip"
  );
});

add_task(async function test_tabGroupCollapseAndExpand() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup("blue", "test", [tab1]);

  Assert.ok(!group.collapsed, "group is expanded by default");

  group.querySelector(".tab-group-label").click();
  Assert.ok(group.collapsed, "group is collapsed on click");

  group.querySelector(".tab-group-label").click();
  Assert.ok(!group.collapsed, "collapsed group is expanded on click");

  group.collapsed = true;
  Assert.ok(group.collapsed, "group is collapsed via API");
  gBrowser.selectedTab = group.tabs[0];
  Assert.ok(!group.collapsed, "group is expanded after selecting tab");

  await removeTabGroup(group);
});

add_task(async function test_tabGroupCollapsedTabsNotVisible() {
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup("blue", "test", [tab]);

  Assert.ok(!group.collapsed, "group is expanded by default");

  Assert.ok(
    gBrowser.visibleTabs.includes(tab),
    "tab in expanded tab group is visible"
  );

  group.collapsed = true;
  Assert.ok(
    !gBrowser.visibleTabs.includes(tab),
    "tab in collapsed tab group is not visible"
  );

  // TODO gBrowser.removeTabs breaks if the tab is not in a visible state
  group.collapsed = false;
  await removeTabGroup(group);
});

/*
 * Tests that if a tab group is collapsed while the selected tab is in the group,
 * the selected tab will change to be the adjacent tab just after the group.
 *
 * This tests that the tab after the group will be prioritized over the tab
 * just before the group, if both exist.
 */
add_task(async function test_tabGroupCollapseSelectsAdjacentTabAfter() {
  let tabInGroup = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup("blue", "test", [tabInGroup]);
  let adjacentTabAfter = BrowserTestUtils.addTab(gBrowser, "about:blank");

  gBrowser.selectedTab = tabInGroup;

  group.collapsed = true;
  Assert.equal(
    gBrowser.selectedTab,
    adjacentTabAfter,
    "selected tab becomes adjacent tab after group on collapse"
  );

  BrowserTestUtils.removeTab(adjacentTabAfter);
  // TODO gBrowser.removeTabs breaks if the tab is not in a visible state
  group.collapsed = false;
  await removeTabGroup(group);
});

/*
 * Tests that if a tab group is collapsed while the selected tab is in the group,
 * the selected tab will change to be the adjacent tab just before the group,
 * if no tabs exist after the group
 */
add_task(async function test_tabGroupCollapseSelectsAdjacentTabBefore() {
  let adjacentTabBefore = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tabInGroup = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup("blue", "test", [tabInGroup]);

  gBrowser.selectedTab = tabInGroup;

  group.collapsed = true;
  Assert.equal(
    gBrowser.selectedTab,
    adjacentTabBefore,
    "selected tab becomes adjacent tab after group on collapse"
  );

  BrowserTestUtils.removeTab(adjacentTabBefore);
  group.collapsed = false;
  await removeTabGroup(group);
});

add_task(async function test_tabGroupCollapseCreatesNewTabIfAllTabsInGroup() {
  // This test has to be run in a new window because there is currently no
  // API to remove a tab from a group, which breaks tests following this one
  // This can be removed once the group remove API is implemented
  let fgWindow = await BrowserTestUtils.openNewBrowserWindow();

  let group = fgWindow.gBrowser.addTabGroup(
    "blue",
    "test",
    fgWindow.gBrowser.tabs
  );

  Assert.equal(fgWindow.gBrowser.tabs.length, 1, "only one tab exists");
  Assert.equal(
    fgWindow.gBrowser.tabs[0].group,
    group,
    "sole existing tab is in group"
  );

  group.collapsed = true;

  Assert.equal(
    fgWindow.gBrowser.tabs.length,
    2,
    "new tab is created if group is collapsed and all tabs are in group"
  );
  Assert.equal(
    fgWindow.gBrowser.selectedTab,
    fgWindow.gBrowser.tabs[1],
    "new tab becomes selected tab"
  );
  Assert.equal(
    fgWindow.gBrowser.selectedTab.group,
    null,
    "new tab is not in group"
  );

  // TODO gBrowser.removeTabs breaks if the tab is not in a visible state
  group.collapsed = false;
  await removeTabGroup(group);
  await BrowserTestUtils.closeWindow(fgWindow);
});

add_task(async function test_tabUngroup() {
  let extraTab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");

  let groupedTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup("blue", "test", [groupedTab]);

  let extraTab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");

  Assert.equal(groupedTab._tPos, 2, "grouped tab starts in correct position");
  Assert.equal(groupedTab.group, group, "tab belongs to group");

  info("Calling ungroupTabs and waiting for TabGroupRemove event.");
  let removePromise = BrowserTestUtils.waitForEvent(group, "TabGroupRemove");
  group.ungroupTabs();
  await removePromise;

  Assert.equal(
    groupedTab._tPos,
    2,
    "tab is in the same position as before ungroup"
  );
  Assert.equal(groupedTab.group, null, "tab no longer belongs to group");

  BrowserTestUtils.removeTab(groupedTab);
  BrowserTestUtils.removeTab(extraTab1);
  BrowserTestUtils.removeTab(extraTab2);
});

add_task(async function test_tabGroupRemove() {
  let groupedTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup("blue", "test", [groupedTab]);

  await removeTabGroup(group);

  Assert.equal(groupedTab.parentElement, null, "grouped tab is unloaded");
  Assert.equal(group.parentElement, null, "group is unloaded");
});

add_task(async function test_tabGroupDeletesWhenLastTabClosed() {
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup("blue", "test", [tab]);

  gBrowser.removeTab(tab);

  Assert.equal(group.parent, null, "group is removed from tabbrowser");
});

add_task(async function test_tabGroupMoveToNewWindow() {
  let tabUri = "https://example.com/tab-group-test";
  let groupedTab = BrowserTestUtils.addTab(gBrowser, tabUri);
  let group = gBrowser.addTabGroup("blue", "test", [groupedTab]);

  info("Calling adoptTabGroup and waiting for TabGroupRemove event.");
  let removePromise = BrowserTestUtils.waitForEvent(group, "TabGroupRemove");

  let fgWindow = await BrowserTestUtils.openNewBrowserWindow();
  fgWindow.gBrowser.adoptTabGroup(group, 0);
  await removePromise;

  Assert.equal(
    gBrowser.tabGroups.length,
    0,
    "Tab group no longer exists in original window"
  );
  Assert.equal(
    fgWindow.gBrowser.tabGroups.length,
    1,
    "A tab group exists in the new window"
  );

  let newGroup = fgWindow.gBrowser.tabGroups[0];

  Assert.equal(
    newGroup.color,
    "blue",
    "New group has same color as original group"
  );
  Assert.equal(
    newGroup.label,
    "test",
    "New group has same label as original group"
  );
  Assert.equal(
    newGroup.tabs.length,
    1,
    "New group has same number of tabs as original group"
  );
  Assert.equal(
    newGroup.tabs[0].linkedBrowser.currentURI.spec,
    tabUri,
    "New tab has same URI as old tab"
  );

  await removeTabGroup(newGroup);
  await BrowserTestUtils.closeWindow(fgWindow);
});

add_task(async function test_TabGroupEvents() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group;

  let createdGroupId = null;
  let tabGroupCreated = BrowserTestUtils.waitForEvent(
    window,
    "TabGroupCreate"
  ).then(event => {
    createdGroupId = event.target.id;
  });
  group = gBrowser.addTabGroup("blue", "test", [tab1]);
  await tabGroupCreated;
  Assert.equal(
    createdGroupId,
    group.id,
    "TabGroupCreate fired with correct group as target"
  );

  let groupedGroupId = null;
  let tabGrouped = BrowserTestUtils.waitForEvent(tab2, "TabGrouped").then(
    event => {
      groupedGroupId = event.detail.id;
    }
  );
  group.addTabs([tab2]);
  await tabGrouped;
  Assert.equal(groupedGroupId, group.id, "TabGrouped fired with correct group");

  let groupCollapsed = BrowserTestUtils.waitForEvent(group, "TabGroupCollapse");
  group.collapsed = true;
  await groupCollapsed;

  let groupExpanded = BrowserTestUtils.waitForEvent(group, "TabGroupExpand");
  group.collapsed = false;
  await groupExpanded;

  let ungroupedGroupId = null;
  let tabUngrouped = BrowserTestUtils.waitForEvent(tab2, "TabUngrouped").then(
    event => {
      ungroupedGroupId = event.detail.id;
    }
  );
  gBrowser.moveTabTo(tab2, 0);
  await tabUngrouped;
  Assert.equal(
    ungroupedGroupId,
    group.id,
    "TabUngrouped fired with correct group"
  );

  let tabGroupRemoved = BrowserTestUtils.waitForEvent(group, "TabGroupRemove");
  await removeTabGroup(group);
  await tabGroupRemoved;

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

add_task(async function test_moveTabBetweenGroups() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");

  let tab1Added = BrowserTestUtils.waitForEvent(tab1, "TabGrouped");
  let tab2Added = BrowserTestUtils.waitForEvent(tab2, "TabGrouped");
  let group1 = gBrowser.addTabGroup("blue", "test1", [tab1]);
  let group2 = gBrowser.addTabGroup("red", "test2", [tab2]);
  await Promise.allSettled([tab1Added, tab2Added]);

  let ungroupedGroupId = null;
  let tabUngrouped = BrowserTestUtils.waitForEvent(tab1, "TabUngrouped").then(
    event => {
      ungroupedGroupId = event.detail.id;
    }
  );
  let groupedGroupId = null;
  let tabGrouped = BrowserTestUtils.waitForEvent(tab1, "TabGrouped").then(
    event => {
      groupedGroupId = event.detail.id;
      Assert.ok(ungroupedGroupId, "TabUngrouped fires before TabGrouped");
    }
  );

  group2.addTabs([tab1]);
  await Promise.allSettled([tabUngrouped, tabGrouped]);
  Assert.equal(ungroupedGroupId, group1.id, "TabUngrouped fired with group1");
  Assert.equal(groupedGroupId, group2.id, "TabGrouped fired with group2");

  Assert.ok(
    !group1.parent,
    "group1 has been removed after losing its last tab"
  );
  Assert.equal(group2.tabs.length, 2, "group2 has 2 tabs");

  await removeTabGroup(group2);
});

// Context menu tests
// ---

const withTabMenu = async function (tab, callback) {
  const tabContextMenu = document.getElementById("tabContextMenu");
  Assert.equal(
    tabContextMenu.state,
    "closed",
    "context menu is initially closed"
  );
  const contextMenuShown = BrowserTestUtils.waitForPopupEvent(
    tabContextMenu,
    "shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    tab,
    { type: "contextmenu", button: 2 },
    window
  );
  await contextMenuShown;

  const moveTabToNewGroupItem = document.getElementById(
    "context_moveTabToNewGroup"
  );
  const moveTabToGroupItem = document.getElementById("context_moveTabToGroup");
  await callback(moveTabToNewGroupItem, moveTabToGroupItem);

  tabContextMenu.hidePopup();
};

/*
 * Tests that the context menu options do not appear if the tab group pref is
 * disabled
 */
add_task(async function test_tabGroupTabContextMenuWithoutPref() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.groups.enabled", false]],
  });

  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });

  await withTabMenu(tab, async (moveTabToNewGroupItem, moveTabToGroupItem) => {
    Assert.ok(moveTabToNewGroupItem.hidden, "moveTabToNewGroupItem is hidden");
    Assert.ok(moveTabToGroupItem.hidden, "moveTabToGroupItem is hidden");
  });

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// Context menu tests: "move tab to new group" option
// (i.e. the option that appears in the menu when no other groups exist)
// ---

/*
 * Tests that when no groups exist, if a tab is selected, the "move tab to
 * group" option appears in the context menu, and clicking it moves the tab to
 * a new group
 */
add_task(async function test_tabGroupContextMenuMoveTabToNewGroup() {
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });

  await withTabMenu(tab, async (moveTabToNewGroupItem, moveTabToGroupItem) => {
    Assert.equal(tab.group, null, "tab is not in group");
    Assert.ok(
      !moveTabToNewGroupItem.hidden,
      "moveTabToNewGroupItem is visible"
    );
    Assert.ok(moveTabToGroupItem.hidden, "moveTabToGroupItem is hidden");

    moveTabToNewGroupItem.click();
  });

  Assert.ok(tab.group, "tab is in group");
  Assert.equal(tab.group.label, "", "tab group label is empty");

  await removeTabGroup(tab.group);
});

/*
 * Tests that when no groups exist, if multiple tabs are selected and one of
 * the selected tabs has its context menu open, the "move tabs to group" option
 * appears in the context menu, and clicking it moves the tabs to a new group
 */
add_task(async function test_tabGroupContextMenuMoveTabsToNewGroup() {
  const tabs = Array.from({ length: 3 }, () => {
    return BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });
  });

  // Click the first tab in our test group to make sure the default tab at the
  // start of the tab strip is deselected
  EventUtils.synthesizeMouseAtCenter(tabs[0], {});

  tabs.forEach(t => {
    EventUtils.synthesizeMouseAtCenter(
      t,
      { ctrlKey: true, metaKey: true },
      window
    );
  });

  let tabToClick = tabs[2];

  await withTabMenu(
    tabToClick,
    async (moveTabToNewGroupItem, moveTabToGroupItem) => {
      Assert.ok(
        !moveTabToNewGroupItem.hidden,
        "moveTabToNewGroupItem is visible"
      );
      Assert.ok(moveTabToGroupItem.hidden, "moveTabToGroupItem is hidden");

      moveTabToNewGroupItem.click();
    }
  );

  let group = tabs[0].group;

  Assert.ok(tabs[0].group, "tab is in group");
  Assert.equal(tabs[0].group.label, "", "tab group label is empty");
  tabs.forEach((t, idx) => {
    Assert.equal(t.group, group, `tabs[${idx}] is in group`);
  });

  await removeTabGroup(group);
});

/*
 * Tests that when no groups exist, if a tab is selected and a tab that is
 * *not* selected has its context menu open, the "move tab to group" option
 * appears in the context menu, and clicking it moves the *context menu* tab to
 * the group, not the selected tab
 */
add_task(
  async function test_tabGroupContextMenuMoveTabToNewGroupWhileAnotherSelected() {
    let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });
    let otherTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });

    EventUtils.synthesizeMouseAtCenter(otherTab, {});

    await withTabMenu(
      tab,
      async (moveTabToNewGroupItem, moveTabToGroupItem) => {
        Assert.equal(
          gBrowser.selectedTabs.includes(TabContextMenu.contextTab),
          false,
          "context menu tab is not selected"
        );
        Assert.ok(
          !moveTabToNewGroupItem.hidden,
          "moveTabToNewGroupItem is visible"
        );
        Assert.ok(moveTabToGroupItem.hidden, "moveTabToGroupItem is hidden");

        moveTabToNewGroupItem.click();
      }
    );

    Assert.ok(tab.group, "tab is in group");
    Assert.equal(otherTab.group, null, "otherTab is not in group");

    await removeTabGroup(tab.group);
    BrowserTestUtils.removeTab(otherTab);
  }
);

/*
 * Tests that when no groups exist, if multiple tabs are selected and a tab
 * that is *not* selected has its context menu open, the "move tabs to group"
 * option appears in the context menu, and clicking it moves the *context menu*
 * tab to the group, not the selected tabs
 */
add_task(
  async function test_tabGroupContextMenuMoveTabToNewGroupWhileOthersSelected() {
    let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });

    const otherTabs = Array.from({ length: 3 }, () => {
      return BrowserTestUtils.addTab(gBrowser, "about:blank", {
        skipAnimation: true,
      });
    });

    otherTabs.forEach(t => {
      EventUtils.synthesizeMouseAtCenter(
        t,
        { ctrlKey: true, metaKey: true },
        window
      );
    });

    await withTabMenu(
      tab,
      async (moveTabToNewGroupItem, moveTabToGroupItem) => {
        Assert.equal(
          gBrowser.selectedTabs.includes(TabContextMenu.contextTab),
          false,
          "context menu tab is not selected"
        );
        Assert.ok(
          !moveTabToNewGroupItem.hidden,
          "moveTabToNewGroupItem is visible"
        );
        Assert.ok(moveTabToGroupItem.hidden, "moveTabToGroupItem is hidden");

        moveTabToNewGroupItem.click();
      }
    );

    Assert.ok(tab.group, "tab is in group");

    otherTabs.forEach((t, idx) => {
      Assert.equal(t.group, null, `otherTab[${idx}] is not in group`);
    });

    await removeTabGroup(tab.group);
    otherTabs.forEach(t => {
      BrowserTestUtils.removeTab(t);
    });
  }
);

// Context menu tests: "move tab to group" option
// (i.e. the option that appears in the menu when other groups already exist)
// ---

/*
 * Tests that when groups exist, the "move tab to group" menu option is visible
 * and is correctly populated with the group list
 */
add_task(async function test_tabGroupContextMenuMoveTabToGroupBasics() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });
  let group1 = gBrowser.addTabGroup("red", "Test group with label", [tab1]);
  let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });
  let group2 = gBrowser.addTabGroup("blue", "", [tab2]);

  let tabToClick = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });

  await withTabMenu(
    tabToClick,
    async (moveTabToNewGroupItem, moveTabToGroupItem) => {
      Assert.ok(
        moveTabToNewGroupItem.hidden,
        "moveTabToNewGroupItem is hidden"
      );
      Assert.ok(!moveTabToGroupItem.hidden, "moveTabToGroupItem is visible");

      const submenu = moveTabToGroupItem.querySelector(
        "#context_moveTabToGroupPopupMenu"
      ).children;

      // Items 0 and 1 are the "new group" item and a separator respectively
      // Note that groups should appear in order of most recently created to least
      const group2Item = submenu[3];
      Assert.equal(
        group2Item.getAttribute("tab-group-id"),
        group2.getAttribute("id"),
        "first group in list is group2"
      );
      Assert.equal(
        group2Item.getAttribute("label"),
        "Unnamed group",
        "group2 menu item has correct label"
      );
      Assert.ok(
        group2Item.getAttribute("image").includes('fill="blue"'),
        "group2 menu item chicklet has correct color"
      );

      const group1Item = submenu[2];
      Assert.equal(
        group1Item.getAttribute("tab-group-id"),
        group1.getAttribute("id"),
        "second group in list is group1"
      );
      Assert.equal(
        group1Item.getAttribute("label"),
        "Test group with label",
        "group1 menu item has correct label"
      );
      Assert.ok(
        group1Item.getAttribute("image").includes('fill="red"'),
        "group1 menu item chicklet has correct color"
      );
    }
  );

  await removeTabGroup(group1);
  await removeTabGroup(group2);
  BrowserTestUtils.removeTab(tabToClick);
});

/*
 * Tests that the "move tab to group > new group" option creates a new group and moves the tab to it
 */
add_task(async function test_tabGroupContextMenuMoveTabToGroupNewGroup() {
  let otherTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });
  let otherGroup = gBrowser.addTabGroup("red", "", [otherTab]);

  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });

  await withTabMenu(tab, async (_, moveTabToGroupItem) => {
    moveTabToGroupItem.querySelector("#context_moveTabToGroupNewGroup").click();
  });

  Assert.ok(tab.group, "tab is in group");
  Assert.notEqual(
    tab.group.id,
    otherGroup.id,
    "tab is not in the original group"
  );

  await removeTabGroup(otherGroup);
  await removeTabGroup(tab.group);
});

/*
 * Tests that the "move tab to group > [group name]" option moves a tab to the selected group
 */
add_task(async function test_tabGroupContextMenuMoveTabToGroupNewGroup() {
  let otherTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });
  let group = gBrowser.addTabGroup("red", "", [otherTab]);

  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });

  await withTabMenu(tab, async (_, moveTabToGroupItem) => {
    moveTabToGroupItem.querySelector(`[tab-group-id="${group.id}"]`).click();
  });

  Assert.ok(tab.group, "tab is in group");
  Assert.equal(tab.group.id, group.id, "tab is in the original group");

  await removeTabGroup(group);
});

/*
 * Tests that when groups exist, and the context menu tab has a group,
 * that group does not exist in the context menu list
 */
add_task(
  async function test_tabGroupContextMenuMoveTabToGroupContextMenuTabNotInList() {
    let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });
    let group1 = gBrowser.addTabGroup("red", "", [tab1]);
    let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });
    let group2 = gBrowser.addTabGroup("blue", "", [tab2]);

    await withTabMenu(tab2, async (_, moveTabToGroupItem) => {
      const submenu = moveTabToGroupItem.querySelector(
        "#context_moveTabToGroupPopupMenu"
      ).children;

      // Accounting for the existence of the "new group" and menuseparator elements
      Assert.equal(submenu.length, 3, "only one tab group exists in the list");
      Assert.equal(
        submenu[2].getAttribute("tab-group-id"),
        group1.getAttribute("id"),
        "tab group in the list is not the context menu tab's group"
      );
    });

    await removeTabGroup(group1);
    await removeTabGroup(group2);
  }
);

/*
 * Tests that when only one group exists, and the context menu tab is in the group,
 * the condensed "move tab to new group" menu item is shown in place of the submenu variant
 */
add_task(
  async function test_tabGroupContextMenuMoveTabToGroupOnlyOneGroupIsSelectedGroup() {
    let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });
    let group = gBrowser.addTabGroup("red", "", [tab]);

    await withTabMenu(
      tab,
      async (moveTabToNewGroupItem, moveTabToGroupItem) => {
        Assert.ok(
          !moveTabToNewGroupItem.hidden,
          "moveTabToNewGroupItem is visible"
        );
        Assert.ok(moveTabToGroupItem.hidden, "moveTabToGroupItem is hidden");
      }
    );

    await removeTabGroup(group);
  }
);

/*
 * Tests that when many groups exist, if many tabs are selected and the
 * selected tabs belong to different groups or are ungrouped, all tab groups
 * appear in the context menu list
 */
add_task(
  async function test_tabGroupContextMenuManySelectedTabsFromManyGroups() {
    const tabs = Array.from({ length: 3 }, () => {
      return BrowserTestUtils.addTab(gBrowser, "about:blank", {
        skipAnimation: true,
      });
    });

    let group1 = gBrowser.addTabGroup("red", "", [tabs[0]]);
    let group2 = gBrowser.addTabGroup("blue", "", [tabs[1]]);

    tabs.forEach(tab => {
      EventUtils.synthesizeMouseAtCenter(
        tab,
        { ctrlKey: true, metaKey: true },
        window
      );
    });

    const tabToClick = tabs[2];

    await withTabMenu(tabToClick, async (_, moveTabToGroupItem) => {
      const submenu = moveTabToGroupItem.querySelector(
        "#context_moveTabToGroupPopupMenu"
      ).children;

      const tabGroupIds = Array.from(submenu).map(item =>
        item.getAttribute("tab-group-id")
      );

      Assert.ok(
        tabGroupIds.includes(group1.getAttribute("id")),
        "group1 is in context menu list"
      );
      Assert.ok(
        tabGroupIds.includes(group2.getAttribute("id")),
        "group2 is in context menu list"
      );
    });

    await removeTabGroup(group1);
    await removeTabGroup(group2);
    BrowserTestUtils.removeTab(tabToClick);
  }
);

/*
 * Tests that when many groups exist, if many tabs are selected and all the
 * tabs belong to the same group, that group does not appear in the context
 * menu list
 */
add_task(
  async function test_tabGroupContextMenuManySelectedTabsFromSameGroup() {
    const tabsToSelect = Array.from({ length: 3 }, () => {
      return BrowserTestUtils.addTab(gBrowser, "about:blank", {
        skipAnimation: true,
      });
    });
    let selectedTabGroup = gBrowser.addTabGroup("red", "", tabsToSelect);
    let otherTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
      skipAnimation: true,
    });
    let otherGroup = gBrowser.addTabGroup("blue", "", [otherTab]);

    // Click the first tab in our test group to make sure the default tab at the
    // start of the tab strip is deselected
    // This is broken on tabs within tab groups ...
    EventUtils.synthesizeMouseAtCenter(tabsToSelect[0], {});

    tabsToSelect.forEach(tab => {
      EventUtils.synthesizeMouseAtCenter(
        tab,
        { ctrlKey: true, metaKey: true },
        window
      );
    });

    await withTabMenu(tabsToSelect[2], async (_, moveTabToGroupItem) => {
      const submenu = moveTabToGroupItem.querySelector(
        "#context_moveTabToGroupPopupMenu"
      ).children;

      const tabGroupIds = Array.from(submenu).map(item =>
        item.getAttribute("tab-group-id")
      );

      Assert.ok(
        !tabGroupIds.includes(selectedTabGroup.getAttribute("id")),
        "group with selected tabs is not in context menu list"
      );
    });

    await removeTabGroup(selectedTabGroup);
    await removeTabGroup(otherGroup);
  }
);

/*
 * Tests that gBrowser.tabs does not contain tab groups after tabs have been
 * moved between tab groups. Resolves bug1920731.
 */
add_task(async function test_tabsContainNoTabGroups() {
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });

  let group1 = gBrowser.addTabGroup("red", "test", [tab]);
  gBrowser.addTabGroup("blue", "test", [tab]);

  Assert.equal(
    gBrowser.tabs.length,
    2,
    "tab strip contains default tab and our tab"
  );
  gBrowser.tabs.forEach((t, idx) => {
    Assert.equal(
      t.constructor.name,
      "MozTabbrowserTab",
      `gBrowser.tabs[${idx}] is of type MozTabbrowserTab`
    );
  });

  BrowserTestUtils.removeTab(tab);
  await removeTabGroup(group1);
});

/**
 * Tests behavior of the group management panel.
 */
add_task(async function test_tabGroupCreatePanel() {
  let tabgroupEditor = document.getElementById("tab-group-editor");
  let tabgroupPanel = tabgroupEditor.panel;
  let nameField = tabgroupPanel.querySelector("#tab-group-name");
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank");

  let panelShown = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "shown");
  let group = gBrowser.addTabGroup("cyan", "Food", [tab]);
  await panelShown;
  Assert.ok(tabgroupEditor.createMode, "Group editor is in create mode");
  // Edit panel should be populated with correct group details
  Assert.ok(
    nameField.value == group.label,
    "Create panel's input populated with correct name"
  );
  Assert.ok(
    tabgroupPanel.querySelector("input[name='tab-group-color']:checked")
      .value == group.color,
    "Create panel's colorpicker has correct color pre-selected"
  );

  // Group should be removed after hitting Cancel
  let panelHidden = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "hidden");
  tabgroupPanel.querySelector("#tab-group-editor-button-cancel").click();
  await panelHidden;
  Assert.ok(!tab.group, "Tab is ungrouped after hitting Cancel");

  panelShown = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "shown");
  group = gBrowser.addTabGroup("cyan", "Food", [tab]);
  await panelShown;

  // Panel inputs should work correctly
  nameField.focus();
  nameField.value = "";
  EventUtils.sendString("Shopping");
  Assert.ok(
    group.label == "Shopping",
    "Group label changed when input value changed"
  );
  tabgroupPanel.querySelector("#tab-group-editor-swatch-red").click();
  Assert.ok(
    group.color == "red",
    "Group color changed to red after clicking red swatch"
  );
  Assert.ok(
    tabgroupPanel.querySelector("input[name='tab-group-color']:checked")
      .value == "red",
    "Red swatch radio selected after clicking red swatch"
  );

  // Panel dismissed after clicking Create and group remains
  panelHidden = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "hidden");
  tabgroupPanel.querySelector("#tab-group-editor-button-create").click();
  await panelHidden;
  Assert.ok(tabgroupPanel.state == "closed", "Tabgroup edit panel is closed");
  Assert.ok(group.label == "Shopping");
  Assert.ok(group.color == "red");

  // right-clicking on the group label reopens the panel in edit mode
  panelShown = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "shown");
  EventUtils.synthesizeMouseAtCenter(
    group.querySelector(".tab-group-label"),
    { type: "contextmenu", button: 2 },
    window
  );
  await panelShown;
  Assert.ok(tabgroupPanel.state == "open", "Tabgroup edit panel is open");
  Assert.ok(!tabgroupEditor.createMode, "Group editor is not in create mode");

  panelHidden = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "hidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHidden;
  gBrowser.removeTabGroup(group, { animate: false });
});

async function createTabGroupAndOpenEditPanel() {
  let tabgroupEditor = document.getElementById("tab-group-editor");
  let tabgroupPanel = tabgroupEditor.panel;
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    animate: false,
  });

  let panelShown = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "shown");
  let group = gBrowser.addTabGroup("cyan", "Food", [tab]);
  await panelShown;

  // Panel dismissed after clicking Create and group remains
  let panelHidden = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "hidden");
  tabgroupPanel.querySelector("#tab-group-editor-button-create").click();
  await panelHidden;

  panelShown = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "shown");
  EventUtils.synthesizeMouseAtCenter(
    group.querySelector(".tab-group-label"),
    { type: "contextmenu", button: 2 },
    window
  );
  return new Promise(resolve => {
    panelShown.then(() => {
      resolve({ tabgroupEditor, tabgroupPanel, tab, group });
    });
  });
}

add_task(async function test_tabGroupPanelAddTab() {
  let { tabgroupPanel, group } = await createTabGroupAndOpenEditPanel();

  let addNewTabButton = tabgroupPanel.querySelector(
    "#tabGroupEditor_addNewTabInGroup"
  );

  Assert.equal(group.tabs.length, 1, "Group has 1 tab");
  let panelHidden = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "hidden");
  addNewTabButton.click();
  await panelHidden;
  Assert.ok(tabgroupPanel.state === "closed", "Group editor is closed");
  Assert.equal(group.tabs.length, 2, "Group has 2 tabs");

  for (let tab of group.tabs) {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_tabGroupPanelUngroupTabs() {
  let { tabgroupPanel, tab, group } = await createTabGroupAndOpenEditPanel();
  let ungroupTabsButton = tabgroupPanel.querySelector(
    "#tabGroupEditor_ungroupTabs"
  );

  Assert.ok(tab.group.id == group.id, "Tab is in group");
  let panelHidden = BrowserTestUtils.waitForPopupEvent(tabgroupPanel, "hidden");
  ungroupTabsButton.click();
  await panelHidden;
  Assert.ok(!tab.group, "Tab is no longer grouped");

  BrowserTestUtils.removeTab(tab);
});
