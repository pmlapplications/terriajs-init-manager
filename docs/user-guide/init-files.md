# Init files

A [Terria init file](https://docs.terria.io/guide/customizing/initialization-files/) is the JSON a
Terria map loads at startup: its catalog, the items shown on the map, the starting view, base maps
and settings. **Init files** lists the init files stored in the app; **New init file** starts one.

## Name and file name

- **Name** is shown in this app only.
- **File name** is the name the JSON is saved and published under, without `.json`. It is filled
  in from the name until you change it. It may contain letters, digits, `.`, `_` and `-`, and must
  start with a letter or digit.
- **Notes** are for other editors and are not exported.

## Catalog and workbench

- **Catalog** is the top level of Terria's data catalog. Pick saved groups, in order; each group
  brings its members with it.
- **Workbench** lists the items added to the map when it loads. They must be inside one of the
  catalog groups. An item that is no longer in the catalog is flagged "Not in the catalog".
- **Previewed item id** is the catalog member shown in the data preview when the catalog opens.

Only published groups and items are exported.

## Map view

The **home camera** is where Terria's home button goes; it is required. The **initial camera** is
where the map opens; if it is not set, the map opens at the home camera.

To set a camera from the map, pan and zoom the map and click **Use map view** next to the camera.
This gives a bounding box (`west`, `south`, `east` and `north` in degrees) that Terria shows from
directly above. You can also type the four sides. For a tilted 3D view, choose **Other camera
(JSON)** and give a `position`/`direction`/`up`, `positionHeading` or `lookAt` camera. The initial
camera can also **focus on the workbench items**.

The map shows OpenStreetMap tiles.

Also in this section:

- **Viewer mode**: 3D with terrain, 3D without terrain, or 2D.
- **Show splitter** and **split position** (from 0, the left edge, to 1, the right edge).

## Base maps, settings and other keys

- **Base maps**: the default and preview base maps, which base maps are enabled (one id per line),
  and extra base maps as JSON.
- **Settings**: native resolution, timeline, terrain depth testing, share URL shortening, screen
  space error and terrain split direction.
- **CORS domains**: hosts that support CORS, one per line, so Terria doesn't proxy them.
- **Stories** and **Other keys** are edited as JSON. Other keys are exported as they are; keys
  that have their own fields can't be set there.

Fields left empty or on **Default** are left out, so Terria's defaults apply.

## Saving and exporting

**Save** stores the init file. As with catalog items, a save is refused if someone else saved the
file since you opened it.

**Exported JSON** at the bottom of the page shows the last saved version as Terria will load it,
and **Download JSON** saves it as `<file name>.json`.

## Publishing

Each init file is either **Published** or **Not published**.

**Publish** writes the last saved version to the server, where anyone can load it at:

```text
https://<this app>/config/<file name>.json
```

The file can be loaded from other websites (it is served with CORS allowed), so a Terria map
hosted elsewhere can use it as an init file URL.

The published file is a snapshot. Saving the init file does not change it; the status turns amber
and says **out of date** until you click **Update**. This lets you work on changes without
affecting the live map.

**Unpublish** deletes the published file after asking you to confirm. Maps that load it will stop
working.

If you rename an init file while it is published, the file stays under the old name until you
update it, which moves it to the new name. You can't publish over a file name that another init
file is still published under.

## Test mode

**Test mode** publishes a separate copy for trying changes out, at:

```text
https://<this app>/config/test/<init file id>.json
```

Unlike the published file, the test copy is rewritten every time you save, so a test map always
shows your latest saved changes. Turning test mode off deletes the test copy. Test mode and
publishing are independent of each other.

Deleting an init file removes both its published file and its test copy. Its groups and items
are kept.
