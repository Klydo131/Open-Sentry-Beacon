// The Explorer's study room, as a workspace the church owns.
//
// ---------------------------------------------------------------------------
// WHY THIS IS OURS AND NOT THEIRS. BlockSuite ships exactly one implementation
// of each of `Workspace`, `Doc` and `WorkspaceMeta`, and all three are in
// `@blocksuite/store/test`, carrying this note:
//
//     @internal
//     Test only
//     Do not use this in production
//
// It is a church's discipleship app; shipping something to members that its own
// authors mark "do not use in production" is not a thing to do quietly. So the
// three classes here implement those interfaces over BlockSuite's PUBLIC pieces
// -- DocEngine, BlobEngine, AwarenessStore, StoreContainer, createYProxy --
// which are exported for exactly this purpose.
//
// The structure follows their test implementation closely, because it is the
// reference for how these interfaces fit together and inventing a different
// shape would be guessing at Yjs subdoc semantics. BlockSuite is MIT; the
// notice is in NOTICES.md.
//
// WHAT IS ACTUALLY DIFFERENT, and it is the only part that matters: the doc
// source. Theirs defaults to a no-op that forgets everything; ours is
// SupabaseDocSource, so a study room is rows in the church's own database
// behind owner-only policies. That was never a detail -- it is the whole reason
// this file exists, because AFFiNE's own server is Enterprise-licensed and
// could not be used.
// ---------------------------------------------------------------------------

import { NoopLogger } from '@blocksuite/global/utils';
import {
  AwarenessStore,
  createYProxy,
  StoreContainer,
  type Doc,
  type DocMeta,
  type DocsPropertiesMeta,
  type GetStoreOptions,
  type IdGenerator,
  type Workspace,
  type WorkspaceMeta,
  type YBlock,
  nanoid,
} from '@blocksuite/store';
import {
  AwarenessEngine,
  BlobEngine,
  DocEngine,
  MemoryBlobSource,
  type AwarenessSource,
  type BlobSource,
  type DocSource,
} from '@blocksuite/sync';
import type { ExtensionType } from '@blocksuite/store';
import { Subject } from 'rxjs';
import { Awareness } from 'y-protocols/awareness.js';
import * as Y from 'yjs';

type MetaState = {
  pages?: unknown[];
  properties?: DocsPropertiesMeta;
  name?: string;
};

/** The list of pages in a room, and their titles. */
class StudyMeta implements WorkspaceMeta {
  readonly id = 'meta';

  docMetaAdded = new Subject<string>();
  docMetaRemoved = new Subject<string>();
  docMetaUpdated = new Subject<void>();

  private readonly _yMap: Y.Map<MetaState[keyof MetaState]>;
  private readonly _proxy: MetaState;
  private _prevDocs = new Set<string>();

  constructor(readonly doc: Y.Doc) {
    this._yMap = doc.getMap(this.id) as Y.Map<MetaState[keyof MetaState]>;
    this._proxy = createYProxy(this._yMap);
    this._yMap.observeDeep(this._onMetaEvents);
  }

  private get _yDocs() {
    return this._yMap.get('pages') as unknown as Y.Array<unknown>;
  }

  private readonly _onMetaEvents = (
    events: Y.YEvent<Y.Array<unknown> | Y.Text | Y.Map<unknown>>[],
  ) => {
    for (const e of events) {
      const touchedPages = e.target === this._yMap && e.changes.keys.has('pages');
      if (e.target === this._yDocs || e.target.parent === this._yDocs || touchedPages) {
        this._announce();
      }
    }
  };

  /**
   * Turn "the list changed" into added/removed, which is what the workspace
   * needs to keep its Doc objects in step with the list.
   */
  private _announce() {
    const now = new Set<string>();
    for (const meta of this.docMetas) {
      if (!this._prevDocs.has(meta.id)) this.docMetaAdded.next(meta.id);
      now.add(meta.id);
    }
    for (const was of this._prevDocs) {
      if (!now.has(was)) this.docMetaRemoved.next(was);
    }
    this._prevDocs = now;
    this.docMetaUpdated.next();
  }

  get docMetas(): DocMeta[] {
    return (this._proxy.pages as DocMeta[] | undefined) ?? [];
  }

  get docs() {
    return this._proxy.pages;
  }

  get properties(): DocsPropertiesMeta {
    return this._proxy.properties ?? { tags: { options: [] } };
  }

  initialize() {
    if (!this._proxy.pages) this._proxy.pages = [];
  }

  addDocMeta(meta: DocMeta, index?: number) {
    this.doc.transact(() => {
      const docs = this.docs as unknown[] | undefined;
      if (!docs) return;
      if (index === undefined) docs.push(meta);
      else docs.splice(index, 0, meta);
    }, this.doc.clientID);
  }

  getDocMeta(id: string) {
    return this.docMetas.find((m) => m.id === id);
  }

  setDocMeta(id: string, props: Partial<DocMeta>) {
    const index = this.docMetas.findIndex((m) => m.id === id);
    if (index === -1) return;
    this.doc.transact(() => {
      const docs = this.docs;
      if (!docs) return;
      const target = docs[index] as Record<string, unknown>;
      for (const [key, value] of Object.entries(props)) target[key] = value;
    }, this.doc.clientID);
  }

  removeDocMeta(id: string) {
    const index = this.docMetas.findIndex((m) => m.id === id);
    if (index === -1) return;
    this.doc.transact(() => {
      this.docs?.splice(index, 1);
    }, this.doc.clientID);
  }

  setProperties(meta: DocsPropertiesMeta) {
    this._proxy.properties = meta;
    this.docMetaUpdated.next();
  }
}

/** One page in the room. A Yjs subdocument, loaded when it is opened. */
class StudyDoc implements Doc {
  readonly id: string;
  readonly rootDoc: Y.Doc;
  readonly awarenessStore: AwarenessStore;

  private readonly _workspace: Workspace;
  private readonly _storeContainer: StoreContainer;
  private readonly _ySpaceDoc: Y.Doc;
  private readonly _yBlocks: Y.Map<YBlock>;
  private _loaded = false;
  private _ready = false;

  constructor(options: {
    id: string;
    workspace: Workspace;
    rootDoc: Y.Doc;
    awarenessStore: AwarenessStore;
  }) {
    this.id = options.id;
    this.rootDoc = options.rootDoc;
    this.awarenessStore = options.awarenessStore;
    this._workspace = options.workspace;
    this._ySpaceDoc = this._openSubDoc();
    this._yBlocks = this._ySpaceDoc.getMap('blocks');
    this._storeContainer = new StoreContainer(this);
  }

  /**
   * A page that already exists arrives unloaded and announces itself later, so
   * the `subdocs` listener is how a room opened on a second device learns its
   * pages have arrived. A page created here is loaded from the start.
   */
  private _openSubDoc(): Y.Doc {
    const spaces = this.rootDoc.getMap('spaces');
    const existing = spaces.get(this.id) as Y.Doc | undefined;
    if (existing) {
      this._loaded = false;
      this.rootDoc.on('subdocs', this._onSubdocs);
      return existing;
    }
    const fresh = new Y.Doc({ guid: this.id });
    spaces.set(this.id, fresh);
    this._loaded = true;
    return fresh;
  }

  private readonly _onSubdocs = ({ loaded }: { loaded: Set<Y.Doc> }) => {
    const mine = [...loaded].find((d) => d.guid === this._ySpaceDoc.guid);
    if (!mine) return;
    this.rootDoc.off('subdocs', this._onSubdocs);
    this._loaded = true;
  };

  get workspace() { return this._workspace; }
  get blobSync() { return this._workspace.blobSync; }
  get meta() { return this._workspace.meta.getDocMeta(this.id); }
  get loaded() { return this._loaded; }
  get ready() { return this._ready; }
  get spaceDoc() { return this._ySpaceDoc; }
  get yBlocks() { return this._yBlocks; }
  get isEmpty() { return this._yBlocks.size === 0; }
  get removeStore() { return this._storeContainer.removeStore; }

  getStore({ readonly, query, provider, extensions, id }: GetStoreOptions = {}) {
    const all = (this._workspace as StudyWorkspace).storeExtensions.concat(extensions ?? []);
    // An id is only derived when neither a readonly view nor a query is asked
    // for; those each want their own store rather than the shared one.
    const storeId = id ?? (readonly !== undefined || query ? undefined : this.spaceDoc.guid);
    return this._storeContainer.getStore({ id: storeId, readonly, query, provider, extensions: all });
  }

  load(initFn?: () => void): this {
    if (this._ready) return this;
    this._ySpaceDoc.load();
    initFn?.();
    this._ready = true;
    return this;
  }

  clear() { this._yBlocks.clear(); }

  dispose() {
    if (this._ready) this._yBlocks.clear();
  }

  remove() {
    this._ySpaceDoc.destroy();
    this._loaded = false;
    this.rootDoc.getMap('spaces').delete(this.id);
  }
}

export type StudyWorkspaceOptions = {
  id: string;
  /** Where pages are kept. The whole point of this file. */
  docSource: DocSource;
  blobSource?: BlobSource;
  awarenessSources?: AwarenessSource[];
  idGenerator?: IdGenerator;
};

export class StudyWorkspace implements Workspace {
  readonly id: string;
  readonly doc: Y.Doc;
  readonly idGenerator: IdGenerator;
  readonly awarenessStore: AwarenessStore;
  readonly awarenessSync: AwarenessEngine;
  readonly docSync: DocEngine;
  readonly blobSync: BlobEngine;
  readonly meta: WorkspaceMeta;

  storeExtensions: ExtensionType[] = [];

  private readonly _docs = new Map<string, StudyDoc>();

  slots = { docListUpdated: new Subject<void>() };

  get docs() { return this._docs; }

  constructor({
    id,
    docSource,
    // Attachments stay in memory until the church decides where they live.
    // Uploads already have rules in this app and a study room must not become
    // a second, quieter way to store files.
    blobSource = new MemoryBlobSource(),
    awarenessSources = [],
    idGenerator = nanoid,
  }: StudyWorkspaceOptions) {
    this.id = id;
    this.doc = new Y.Doc({ guid: id });
    this.idGenerator = idGenerator;

    const logger = new NoopLogger();
    this.awarenessStore = new AwarenessStore(new Awareness(this.doc));
    this.awarenessSync = new AwarenessEngine(this.awarenessStore.awareness, awarenessSources);
    this.docSync = new DocEngine(this.doc, docSource, [], logger);
    this.blobSync = new BlobEngine(blobSource, [], logger);

    this.meta = new StudyMeta(this.doc);
    this._followTheList();
  }

  /**
   * The page list is the source of truth, not this map. A page added on another
   * device arrives as a meta change, and this is what turns it into something
   * the editor can open.
   */
  private _followTheList() {
    this.meta.docMetaAdded.subscribe((docId) => {
      this._docs.set(docId, new StudyDoc({
        id: docId,
        workspace: this,
        rootDoc: this.doc,
        awarenessStore: this.awarenessStore,
      }));
    });
    this.meta.docMetaUpdated.subscribe(() => this.slots.docListUpdated.next());
    this.meta.docMetaRemoved.subscribe((docId) => {
      const gone = this._docs.get(docId);
      if (!gone) return;
      this._docs.delete(docId);
      gone.remove();
    });
  }

  createDoc(docId?: string): Doc {
    const id = docId ?? this.idGenerator();
    if (this._docs.has(id)) {
      // Louder than returning the existing one: two pages sharing an id is a
      // bug that shows up later as edits landing in the wrong place.
      throw new Error(`A page called ${id} is already open in this room.`);
    }
    this.meta.addDocMeta({ id, title: '', createDate: Date.now(), tags: [] });
    const made = this._docs.get(id);
    if (!made) throw new Error('That page could not be added to the room.');
    return made;
  }

  getDoc(docId: string): Doc | null {
    return this._docs.get(docId) ?? null;
  }

  removeDoc(docId: string) {
    if (!this.meta.getDocMeta(docId)) return;
    const doc = this._docs.get(docId);
    if (!doc) return;
    doc.dispose();
    this.meta.removeDocMeta(docId);
    this._docs.delete(docId);
  }

  /** Begin syncing with the database. */
  start() {
    this.docSync.start();
    this.blobSync.start();
    this.awarenessSync.connect();
  }

  /** Everything written is safely in the database. */
  waitForSynced() { return this.docSync.waitForSynced(); }
  canGracefulStop() { return this.docSync.canGracefulStop(); }
  waitForGracefulStop(abort?: AbortSignal) { return this.docSync.waitForGracefulStop(abort); }

  /**
   * Stop without waiting. Loses anything not yet written, so the caller checks
   * `canGracefulStop` first -- leaving a room should not lose the last sentence
   * somebody typed in it.
   */
  forceStop() {
    this.docSync.forceStop();
    this.blobSync.stop();
    this.awarenessSync.disconnect();
  }

  dispose() {
    this.awarenessStore.destroy();
  }
}
