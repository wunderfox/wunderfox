# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

## Variables:
##  $tabCount (Number): the number of tabs that are affected by the action.

tab-context-unnamed-group =
    .label = Unnamed group

tab-context-move-tab-to-new-group =
    .label =
        { $tabCount ->
            [1] Add Tab to New Group
           *[other] Add Tabs to New Group
        }
    .accesskey = G
tab-context-move-tab-to-group =
    .label =
        { $tabCount ->
            [1] Add Tab to Group
           *[other] Add Tabs to Group
        }
    .accesskey = G

tab-group-editor-action-add-new = Add tab to group
tab-group-editor-action-new-window = Move group to new window
tab-group-editor-action-save = Save and close group
tab-group-editor-action-ungroup = Ungroup tabs
tab-group-editor-action-delete = Delete group
tab-group-editor-done =
  .label = Done
  .accessKey = D
