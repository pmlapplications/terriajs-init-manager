# Catalog items and groups

A Terria catalog is made of **items** (a WMS layer, a CSV table, a GeoJSON file, ...) and
**groups** that hold items and other groups. TerriaJS Init Manager stores both, and edits each
one as the JSON Terria expects.

## The catalog table

The landing page, **Catalog items**, lists every saved item and group in a paged table.

- **Search** matches the name, Terria id, URL and description.
- **Filter** by kind (items or groups), by type, or by published state.
- **Sort** by clicking a column header; click again to reverse the order.
- Click a **name** to open it in the editor.
- **Orphaned only** shows the items and groups that are in no group and no init file.
- The **duplicate** button opens an unsaved copy in the editor, named "Copy of …". Save it with
  **Save new**. The copy has no Terria id or share keys, since those must be unique.

The table remembers its search, filters, sort and page for the browser tab, so you can go to the
editor and come back to where you were.

The **Published** column shows whether an item or group is included when init files are
exported. Unpublished members are left out of exported and published init files. There is
currently no control for this in the app.

## Deleting an item or group

The **delete** button at the end of a row deletes the item or group, after asking you to confirm.
It is removed from any groups it is in. Deleting a group does not delete its members.

An item or group that an init file uses can't be deleted, and its delete button is greyed out.
An init file uses a member that is in its catalog or workbench, or that is inside a group in its
catalog at any depth. To delete it, first remove it, or the group containing it, from those init
files.

## Creating an item or group

**Create New** shows every catalog type Terria documents, grouped by kind of data: groups,
imagery and map services, vector features, tables and charts, 3D and terrain, and other. Type in
the filter box to find a type by name (for example `wms`, `WebMapService` or `csv`), then click it
to open its editor.

If the editor already holds an unsaved draft of that type, you are asked whether to clear it.
Choose **Cancel** to carry on with the draft.

## The editor

The editor is generated from the type's traits, as listed in
[Terria's catalog type documentation](https://docs.terria.io/guide/connecting-to-data/catalog-items/).
The header links to the documentation page for the type.

- The **sidebar** lists sections (Basics, the type's own options, Display & workbench, Legends,
  ...) with how many traits in each are set. Use **Search traits** to find a trait in any section,
  or **Only show set traits** to hide the empty ones.
- Each field shows the trait's name, type, default and description. Fields that are left empty are
  left out of the JSON, so Terria's defaults apply. **clear** removes a trait.
- Nested traits (such as `rectangle`) open in place, and lists of objects (such as `legends`) are
  shown as cards you can add, reorder and remove.
- The **JSON** panel shows the item exactly as Terria will read it. **Copy** and **Download** give
  you that JSON.

### Checking values

Every change is checked against the trait definitions: types, allowed values, number ranges, URL,
colour and date formats, and rules that span several traits (for example, a minimum must not be
greater than the maximum). The status button in the header shows the number of errors and
warnings; click it for the list, and click an entry to jump to the field.

Errors must be fixed before saving. Warnings, such as an unknown trait or a WMS item with no
layers, don't block saving.

### WMS layers and styles

For WMS items, **Load from server** reads the service's GetCapabilities document (from
`getCapabilitiesUrl` or `url`). The layers field then suggests the server's layers, the styles
field offers each layer's styles, and the `rectangle` trait can be set from the extent of the
chosen layers. The request is made by your browser, so the WMS server must allow cross-origin
(CORS) requests.

### Saving

- **Save new** stores the item in the database. **Save** updates it afterwards.
- **Open** loads a saved item or group of the current type.
- **Import JSON** replaces the form with pasted catalog JSON.
- **New** clears the form.

If someone else saved the same item since you opened it, your save is refused with a message
giving the newer version. Reload the item and make your change again.

Your current draft of each type is kept in the browser, so reloading the page or switching to
another type doesn't lose it.

## Groups

Groups are edited like items, with an extra **Members** section. Search for saved items and
groups, then **Add** them; the order of the list is the order shown in Terria's catalog.

A group may only contain certain types. A plain `group` takes any item or group. A server-backed
group such as a `wms-group` takes the item types that server provides (`wms`) and groups of its
own type. The search only offers allowed types, and a group can't contain itself or one of the
groups it is already inside.

The same item can be in several groups.
