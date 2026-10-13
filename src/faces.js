(function attachFaceGroupingService() {
  'use strict';

  const MODEL_VERSION = 'face-api-dlib-v1';
  const INDEX_SCHEMA = 1;
  const MODEL_ROOT = 'kod://face-models/';
  const GROUP_THRESHOLD = 0.5;
  const PROFILE_THRESHOLD = 0.5;
  const MANUAL_IDENTITY_THRESHOLD = 0.55;

  function averageDescriptors(descriptors) {
    if (!descriptors.length) return [];
    const output = new Array(descriptors[0].length).fill(0);
    for (const descriptor of descriptors) {
      descriptor.forEach((value, index) => { output[index] += Number(value) || 0; });
    }
    return output.map((value) => value / descriptors.length);
  }

  function distance(left, right) {
    if (!left?.length || left.length !== right?.length) return Number.POSITIVE_INFINITY;
    let sum = 0;
    for (let index = 0; index < left.length; index += 1) {
      const difference = left[index] - right[index];
      sum += difference * difference;
    }
    return Math.sqrt(sum);
  }

  function diverseDescriptors(descriptors, limit = 32) {
    const candidates = descriptors.filter((descriptor) => descriptor?.length);
    if (candidates.length <= limit) return candidates.map((descriptor) => [...descriptor]);
    const chosen = [[...candidates[0]]];
    const remaining = candidates.slice(1);
    while (chosen.length < limit && remaining.length) {
      let bestIndex = 0;
      let bestDistance = -1;
      for (let index = 0; index < remaining.length; index += 1) {
        const nearest = Math.min(...chosen.map((entry) => distance(entry, remaining[index])));
        if (nearest > bestDistance) {
          bestDistance = nearest;
          bestIndex = index;
        }
      }
      chosen.push([...remaining.splice(bestIndex, 1)[0]]);
    }
    return chosen;
  }

  function makeId(prefix = 'person') {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  class FaceGroupingService {
    constructor(api, onChange = () => {}) {
      this.api = api;
      this.onChange = onChange;
      this.folder = null;
      this.items = [];
      this.index = null;
      this.modelsReady = false;
      this.scanPromise = null;
      this.cancelRequested = false;
      this.paused = false;
      this.status = {
        phase: 'idle',
        completed: 0,
        total: 0,
        currentName: '',
        message: 'Ready to scan',
        error: ''
      };
    }

    async load(folder, items) {
      this.folder = folder;
      this.items = items.filter((item) => item.kind === 'image' || item.kind === 'live');
      const saved = await this.api.loadFaceIndex(folder);
      const validSaved = saved
        && saved.schema === INDEX_SCHEMA
        && saved.modelVersion === MODEL_VERSION
        && typeof saved.files === 'object';

      this.index = validSaved ? saved : this.newIndex();
      this.index.files ||= {};
      this.index.groups ||= [];
      this.index.profile ||= null;
      this.index.manualIdentities ||= [];

      const currentIds = new Set(this.items.map((item) => item.id));
      let removedStaleEntries = false;
      for (const id of Object.keys(this.index.files)) {
        if (!currentIds.has(id)) {
          delete this.index.files[id];
          removedStaleEntries = true;
        }
      }

      const pending = this.pendingItems();
      const cachedCount = this.items.length - pending.length;
      if (cachedCount > 0) this.regroup();
      if (removedStaleEntries) await this.save().catch(() => {});
      this.setStatus({
        phase: pending.length ? 'ready' : 'complete',
        completed: cachedCount,
        total: this.items.length,
        currentName: '',
        message: pending.length
          ? `${pending.length} new or changed photo${pending.length === 1 ? '' : 's'} to scan`
          : `Face grouping is up to date for ${this.items.length} photo${this.items.length === 1 ? '' : 's'}`,
        error: ''
      });
      return this.snapshot();
    }

    newIndex() {
      return {
        schema: INDEX_SCHEMA,
        modelVersion: MODEL_VERSION,
        folder: this.folder,
        files: {},
        groups: [],
        profile: null,
        manualIdentities: []
      };
    }

    fingerprint(item) {
      return `${item.id}|${item.size}|${item.timestamp}|${MODEL_VERSION}`;
    }

    pendingItems() {
      return this.items.filter((item) => {
        const cached = this.index?.files?.[item.id];
        return !cached || cached.fingerprint !== this.fingerprint(item);
      });
    }

    snapshot() {
      return {
        status: { ...this.status },
        groups: this.getGroups(),
        profile: this.index?.profile || null,
        indexedCount: Object.keys(this.index?.files || {}).length,
        photoCount: this.items.length
      };
    }

    setStatus(update) {
      this.status = { ...this.status, ...update };
      this.onChange(this.snapshot());
    }

    async loadModels() {
      if (this.modelsReady) return;
      this.setStatus({ phase: 'loading', message: 'Loading the private face models…', error: '' });
      if (!window.faceapi) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'vendor/face-api.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('The local face engine could not be loaded.'));
          document.head.append(script);
        });
      }
      await Promise.all([
        window.faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_ROOT),
        window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_ROOT),
        window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_ROOT)
      ]);
      this.modelsReady = true;
    }

    async imageCanvas(url) {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.decoding = 'async';
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('The photo could not be opened for face grouping.'));
        element.src = url;
      });
      const maximumSide = 1280;
      const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    }

    faceThumbnail(canvas, box) {
      try {
        const padding = Math.max(box.width, box.height) * 0.35;
        const left = Math.max(0, Math.floor(box.x - padding));
        const top = Math.max(0, Math.floor(box.y - padding));
        const right = Math.min(canvas.width, Math.ceil(box.x + box.width + padding));
        const bottom = Math.min(canvas.height, Math.ceil(box.y + box.height + padding));
        const size = 112;
        const output = document.createElement('canvas');
        output.width = size;
        output.height = size;
        output.getContext('2d', { alpha: false }).drawImage(
          canvas,
          left,
          top,
          Math.max(1, right - left),
          Math.max(1, bottom - top),
          0,
          0,
          size,
          size
        );
        return output.toDataURL('image/jpeg', 0.78);
      } catch {
        return '';
      }
    }

    async analyzeUrl(url) {
      const canvas = await this.imageCanvas(url);
      const options = new window.faceapi.SsdMobilenetv1Options({ minConfidence: 0.55 });
      const detections = await window.faceapi
        .detectAllFaces(canvas, options)
        .withFaceLandmarks()
        .withFaceDescriptors();
      return detections.map((result) => ({
        descriptor: Array.from(result.descriptor),
        confidence: result.detection.score,
        box: {
          x: result.detection.box.x / canvas.width,
          y: result.detection.box.y / canvas.height,
          width: result.detection.box.width / canvas.width,
          height: result.detection.box.height / canvas.height
        },
        thumbnail: this.faceThumbnail(canvas, result.detection.box),
        groupId: null
      }));
    }

    async scan({ force = false } = {}) {
      if (this.scanPromise) return this.scanPromise;
      this.scanPromise = this.runScan(force).finally(() => { this.scanPromise = null; });
      return this.scanPromise;
    }

    async runScan(force) {
      try {
        await this.loadModels();
        if (force) this.index.files = {};
        this.cancelRequested = false;
        this.paused = false;
        const pending = this.pendingItems();
        const cachedCount = this.items.length - pending.length;
        this.setStatus({
          phase: 'scanning',
          completed: cachedCount,
          total: this.items.length,
          message: pending.length ? 'Scanning photos on this computer…' : 'Using saved face groups…',
          currentName: '',
          error: ''
        });

        for (let index = 0; index < pending.length; index += 1) {
          if (this.cancelRequested) break;
          while (this.paused && !this.cancelRequested) await wait(120);
          if (this.cancelRequested) break;

          const item = pending[index];
          this.setStatus({
            phase: 'scanning',
            completed: cachedCount + index,
            total: this.items.length,
            currentName: item.name,
            message: 'Finding faces locally…'
          });
          try {
            const url = await this.api.mediaUrl(item.path);
            const faces = await this.analyzeUrl(url);
            this.index.files[item.id] = {
              fingerprint: this.fingerprint(item),
              name: item.name,
              faces,
              scannedAt: new Date().toISOString()
            };
          } catch (error) {
            this.index.files[item.id] = {
              fingerprint: this.fingerprint(item),
              name: item.name,
              faces: [],
              scanError: error.message || 'Could not scan this photo',
              scannedAt: new Date().toISOString()
            };
          }

          if ((index + 1) % 5 === 0) {
            this.regroup();
            await this.save().catch(() => {});
          }
          await wait(0);
        }

        this.regroup();
        await this.save();
        const completed = Object.keys(this.index.files).length;
        const cancelled = this.cancelRequested;
        this.setStatus({
          phase: cancelled ? 'cancelled' : 'complete',
          completed,
          total: this.items.length,
          currentName: '',
          message: cancelled
            ? `Scan paused after ${completed} photo${completed === 1 ? '' : 's'}; saved progress will be reused`
            : `Found ${this.index.groups.length} ${this.index.groups.length === 1 ? 'person' : 'people'} across ${this.items.length} photos`,
          error: ''
        });
      } catch (error) {
        this.setStatus({
          phase: 'error',
          currentName: '',
          message: 'Face grouping could not finish',
          error: error.message || 'The offline face engine could not start.'
        });
        throw error;
      }
      return this.snapshot();
    }

    pause() {
      if (this.status.phase !== 'scanning') return;
      this.paused = true;
      this.setStatus({ phase: 'paused', message: 'Scan paused; completed work is saved' });
    }

    resume() {
      if (!this.paused) return;
      this.paused = false;
      this.setStatus({ phase: 'scanning', message: 'Finding faces locally…' });
    }

    cancel() {
      this.cancelRequested = true;
      this.paused = false;
    }

    regroup() {
      const previousGroups = this.index.groups || [];
      const previousById = new Map(previousGroups.map((group) => [group.id, group]));
      const faces = [];
      for (const [photoId, file] of Object.entries(this.index.files || {})) {
        for (const face of file.faces || []) faces.push({ ...face, photoId });
      }

      const automaticClusters = [];
      for (const face of faces) {
        let best = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const cluster of automaticClusters) {
          const candidateDistance = distance(face.descriptor, cluster.centroid);
          if (candidateDistance < bestDistance) {
            best = cluster;
            bestDistance = candidateDistance;
          }
        }
        if (!best || bestDistance > GROUP_THRESHOLD) {
          automaticClusters.push({ faces: [face], centroid: [...face.descriptor] });
        } else {
          best.faces.push(face);
          best.centroid = averageDescriptors(best.faces.map((entry) => entry.descriptor));
        }
      }

      const manualIdentities = this.index.manualIdentities || [];
      const manualById = new Map(manualIdentities.map((identity) => [identity.id, identity]));
      for (const cluster of automaticClusters) {
        const votes = new Map();
        for (const face of cluster.faces) {
          if (face.manualIdentityId && manualById.has(face.manualIdentityId)) {
            votes.set(face.manualIdentityId, (votes.get(face.manualIdentityId) || 0) + 1);
          }
        }
        let manualIdentityId = [...votes.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
        if (!manualIdentityId) {
          let bestIdentity = null;
          let bestIdentityDistance = Number.POSITIVE_INFINITY;
          for (const identity of manualIdentities) {
            for (const face of cluster.faces) {
              for (const anchor of identity.anchors || []) {
                const candidateDistance = distance(face.descriptor, anchor);
                if (candidateDistance < bestIdentityDistance) {
                  bestIdentity = identity;
                  bestIdentityDistance = candidateDistance;
                }
              }
            }
          }
          if (bestIdentityDistance <= MANUAL_IDENTITY_THRESHOLD) manualIdentityId = bestIdentity?.id;
        }
        cluster.manualIdentityId = manualIdentityId || null;
        if (cluster.manualIdentityId) {
          cluster.faces.forEach((face) => { face.manualIdentityId = cluster.manualIdentityId; });
        }
      }

      const clusters = [];
      const constrainedClusters = new Map();
      for (const cluster of automaticClusters) {
        if (!cluster.manualIdentityId) {
          clusters.push(cluster);
          continue;
        }
        const existing = constrainedClusters.get(cluster.manualIdentityId);
        if (!existing) {
          constrainedClusters.set(cluster.manualIdentityId, cluster);
          clusters.push(cluster);
        } else {
          existing.faces.push(...cluster.faces);
          existing.centroid = averageDescriptors(existing.faces.map((face) => face.descriptor));
        }
      }

      const usedIds = new Set();
      const profileDescriptors = this.index.profile?.descriptors || [];
      const groups = clusters.map((cluster, position) => {
        const manualIdentity = cluster.manualIdentityId
          ? manualById.get(cluster.manualIdentityId)
          : null;
        const priorVotes = new Map();
        for (const face of cluster.faces) {
          if (face.groupId && previousById.has(face.groupId)) {
            priorVotes.set(face.groupId, (priorVotes.get(face.groupId) || 0) + 1);
          }
        }
        let prior = [...priorVotes.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([id]) => previousById.get(id))
          .find((group) => group && !usedIds.has(group.id));
        if (!prior) {
          prior = previousGroups
            .filter((group) => !usedIds.has(group.id))
            .map((group) => ({ group, similarity: distance(group.centroid, cluster.centroid) }))
            .filter((entry) => entry.similarity <= 0.42)
            .sort((left, right) => left.similarity - right.similarity)[0]?.group;
        }

        const isMe = Boolean(manualIdentity?.isMe) || profileDescriptors.some(
          (descriptor) => distance(descriptor, cluster.centroid) <= PROFILE_THRESHOLD
        );
        let id = isMe ? 'me' : manualIdentity?.id || prior?.id || makeId();
        if (usedIds.has(id)) id = makeId();
        usedIds.add(id);
        cluster.faces.forEach((face) => { face.groupId = id; });

        const photos = [...new Set(cluster.faces.map((face) => face.photoId))];
        return {
          id,
          name: manualIdentity?.name || (isMe ? (this.index.profile?.name || 'Me') : (prior?.name || `Person ${position + 1}`)),
          tags: manualIdentity?.tags || (isMe ? ['Me'] : (prior?.tags || [])),
          isMe,
          hidden: manualIdentity?.hidden || prior?.hidden || false,
          manualIdentityId: manualIdentity?.id || null,
          manuallyCombined: Boolean(manualIdentity),
          centroid: cluster.centroid,
          thumbnail: cluster.faces.find((face) => face.thumbnail)?.thumbnail || prior?.thumbnail || '',
          photoIds: photos,
          faceCount: cluster.faces.length
        };
      });

      for (const cluster of clusters) {
        for (const face of cluster.faces) {
          const storedFace = this.index.files[face.photoId]?.faces?.find(
            (entry) => entry.descriptor === face.descriptor
              || entry.descriptor?.every((value, index) => value === face.descriptor[index])
          );
          if (storedFace) {
            storedFace.groupId = face.groupId;
            if (face.manualIdentityId) storedFace.manualIdentityId = face.manualIdentityId;
            else delete storedFace.manualIdentityId;
          }
        }
      }
      this.index.groups = groups.sort((left, right) => {
        if (left.isMe !== right.isMe) return left.isMe ? -1 : 1;
        return right.photoIds.length - left.photoIds.length;
      });
    }

    getGroups({ includeHidden = false } = {}) {
      const groups = this.index?.groups || [];
      return groups.filter((group) => includeHidden || !group.hidden);
    }

    matchingItemIds(personIds, mode = 'any') {
      const selected = new Set(personIds);
      if (!selected.size) return [];
      const matches = [];
      for (const item of this.items) {
        const present = new Set(
          (this.index.files[item.id]?.faces || []).map((face) => face.groupId).filter(Boolean)
        );
        const matched = mode === 'all'
          ? [...selected].every((id) => present.has(id))
          : [...selected].some((id) => present.has(id));
        if (matched) matches.push(item.id);
      }
      return matches;
    }

    async mergeGroups(groupIds, requestedName) {
      const selected = new Set(groupIds);
      const groups = this.index.groups.filter((group) => selected.has(group.id));
      if (groups.length < 2) throw new Error('Select at least two people to combine.');

      const existingIdentityIds = [...new Set(
        groups.map((group) => group.manualIdentityId).filter(Boolean)
      )];
      const existingIdentities = this.index.manualIdentities.filter(
        (identity) => existingIdentityIds.includes(identity.id)
      );
      const identityId = existingIdentities[0]?.id || makeId('identity');
      const isMe = groups.some((group) => group.isMe) || existingIdentities.some((identity) => identity.isMe);
      const defaultName = groups.find((group) => group.isMe)?.name
        || groups.find((group) => !/^Person \d+$/i.test(group.name))?.name
        || groups[0].name;
      const name = requestedName?.trim() || defaultName;
      const descriptors = existingIdentities.flatMap((identity) => identity.anchors || []);

      for (const file of Object.values(this.index.files)) {
        for (const face of file.faces || []) {
          if (selected.has(face.groupId) || existingIdentityIds.includes(face.manualIdentityId)) {
            face.manualIdentityId = identityId;
            descriptors.push(face.descriptor);
          }
        }
      }

      const tags = [...new Set([
        ...groups.flatMap((group) => group.tags || []),
        ...existingIdentities.flatMap((identity) => identity.tags || [])
      ])];
      const identity = {
        id: identityId,
        name,
        tags: isMe ? [...new Set(['Me', ...tags])] : tags,
        isMe,
        hidden: false,
        anchors: diverseDescriptors(descriptors),
        createdAt: existingIdentities[0]?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.index.manualIdentities = this.index.manualIdentities.filter(
        (entry) => !existingIdentityIds.includes(entry.id)
      );
      this.index.manualIdentities.push(identity);
      if (isMe && this.index.profile) this.index.profile.name = name;
      this.regroup();
      await this.save();
      this.onChange(this.snapshot());
      return this.index.groups.find((group) => group.manualIdentityId === identityId) || null;
    }

    async unmergeGroup(groupId) {
      const group = this.index.groups.find((entry) => entry.id === groupId);
      if (!group?.manualIdentityId) return false;
      const identityId = group.manualIdentityId;
      for (const file of Object.values(this.index.files)) {
        for (const face of file.faces || []) {
          if (face.manualIdentityId === identityId) delete face.manualIdentityId;
        }
      }
      this.index.manualIdentities = this.index.manualIdentities.filter(
        (identity) => identity.id !== identityId
      );
      this.regroup();
      await this.save();
      this.onChange(this.snapshot());
      return true;
    }

    async enrollMe(name = 'Me') {
      await this.loadModels();
      const paths = await this.api.selectFaceReferences();
      if (!paths.length) return { cancelled: true, accepted: 0, rejected: [] };
      const descriptors = [];
      const thumbnails = [];
      const rejected = [];
      for (const filePath of paths.slice(0, 3)) {
        try {
          const url = await this.api.faceReferenceUrl(filePath);
          const faces = await this.analyzeUrl(url);
          if (faces.length !== 1) {
            rejected.push({ filePath, reason: faces.length ? 'More than one face was found' : 'No clear face was found' });
            continue;
          }
          descriptors.push(faces[0].descriptor);
          if (faces[0].thumbnail) thumbnails.push(faces[0].thumbnail);
        } catch (error) {
          rejected.push({ filePath, reason: error.message || 'Could not read the photo' });
        }
      }
      if (!descriptors.length) return { cancelled: false, accepted: 0, rejected };
      this.index.profile = {
        name: name.trim() || 'Me',
        descriptors,
        centroid: averageDescriptors(descriptors),
        thumbnail: thumbnails[0] || '',
        referenceCount: descriptors.length
      };
      this.regroup();
      await this.save();
      this.onChange(this.snapshot());
      return { cancelled: false, accepted: descriptors.length, rejected };
    }

    async updateProfileName(name) {
      if (!this.index.profile) return;
      this.index.profile.name = name.trim() || 'Me';
      const me = this.index.groups.find((group) => group.isMe);
      if (me) me.name = this.index.profile.name;
      await this.save();
      this.onChange(this.snapshot());
    }

    async updateGroup(id, update) {
      const group = this.index.groups.find((entry) => entry.id === id);
      if (!group) return;
      if (typeof update.name === 'string') group.name = update.name.trim() || group.name;
      if (Array.isArray(update.tags)) {
        group.tags = [...new Set(update.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 8);
      }
      if (typeof update.hidden === 'boolean') group.hidden = update.hidden;
      if (group.isMe && this.index.profile) this.index.profile.name = group.name;
      if (group.manualIdentityId) {
        const identity = this.index.manualIdentities.find(
          (entry) => entry.id === group.manualIdentityId
        );
        if (identity) {
          identity.name = group.name;
          identity.tags = group.tags;
          identity.hidden = group.hidden;
          identity.updatedAt = new Date().toISOString();
        }
      }
      await this.save();
      this.onChange(this.snapshot());
    }

    async removeItems(ids) {
      const removed = new Set(ids);
      this.items = this.items.filter((item) => !removed.has(item.id));
      for (const id of removed) delete this.index.files[id];
      this.regroup();
      await this.save();
      this.onChange(this.snapshot());
    }

    async restoreHiddenGroups() {
      let restored = 0;
      for (const group of this.index.groups) {
        if (group.hidden) {
          group.hidden = false;
          restored += 1;
        }
      }
      if (restored) await this.save();
      this.onChange(this.snapshot());
      return restored;
    }

    async clear() {
      this.cancel();
      if (this.scanPromise) await this.scanPromise.catch(() => {});
      await this.api.clearFaceIndex(this.folder);
      this.index = this.newIndex();
      this.setStatus({
        phase: 'ready', completed: 0, total: this.items.length,
        currentName: '', message: 'Face data cleared; ready for a fresh scan', error: ''
      });
    }

    async save() {
      this.index.folder = this.folder;
      this.index.modelVersion = MODEL_VERSION;
      this.index.schema = INDEX_SCHEMA;
      return this.api.saveFaceIndex(this.folder, this.index);
    }
  }

  window.FaceGroupingService = FaceGroupingService;
})();
