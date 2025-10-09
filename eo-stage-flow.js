(function (global) {
  'use strict';

  const OPERATORS = [
    { id: 'starter', name: 'Starter', desc: 'Conceives and designs work', seq: 1, tier: 'genesis' },
    { id: 'doer', name: 'Doer', desc: 'Builds and produces artifacts', seq: 2, tier: 'genesis' },
    { id: 'compiler', name: 'Compiler', desc: 'Packages work into coherent form', seq: 3, tier: 'genesis' },
    { id: 'reviewer', name: 'Reviewer', desc: 'Tests and evaluates quality', seq: 4, tier: 'evaluation' },
    { id: 'approver', name: 'Approver', desc: 'Authorizes and validates', seq: 5, tier: 'evaluation' },
    { id: 'documenter', name: 'Documenter', desc: 'Records and formalizes', seq: 6, tier: 'evaluation' },
    { id: 'integrator', name: 'Integrator', desc: 'Synthesizes into coherent wholes', seq: 7, tier: 'continuity' },
    { id: 'maintainer', name: 'Maintainer', desc: 'Preserves and sustains systems', seq: 8, tier: 'continuity' },
    { id: 'evolver', name: 'Evolver', desc: 'Transforms and reinitiates cycles', seq: 9, tier: 'continuity' }
  ];

  const OPERATOR_INDEX = OPERATORS.reduce((acc, operator) => {
    acc[operator.id] = operator;
    return acc;
  }, {});

  function normalizeRole(role) {
    if (!role || typeof role !== 'object') return null;

    const {
      id,
      name,
      userIds = [],
      parentRoleId = null,
      childRoleIds = []
    } = role;

    if (!id) {
      throw new Error('Role requires an id');
    }

    return {
      id,
      name: name || id,
      userIds: Array.from(new Set(userIds)),
      parentRoleId,
      childRoleIds: Array.from(new Set(childRoleIds))
    };
  }

  function normalizeRoles(roles) {
    if (!roles) return {};
    const map = {};
    const list = Array.isArray(roles) ? roles : Object.values(roles);
    list.forEach((role) => {
      const normalized = normalizeRole(role);
      if (normalized) {
        map[normalized.id] = normalized;
      }
    });

    Object.values(map).forEach((role) => {
      const parentId = role.parentRoleId;
      if (parentId && map[parentId]) {
        const parent = map[parentId];
        if (!parent.childRoleIds.includes(role.id)) {
          parent.childRoleIds = Array.from(new Set([...(parent.childRoleIds || []), role.id]));
        }
      }

      role.childRoleIds = Array.from(new Set(role.childRoleIds || [])).filter((childId) => {
        if (!map[childId]) return false;
        if (!map[childId].parentRoleId) {
          map[childId].parentRoleId = role.id;
        }
        return true;
      });
    });

    return map;
  }

  function createDefaultStageConfig() {
    return OPERATORS.map((operator) => ({
      stageKey: operator.id,
      active: false,
      assignedRoleIds: [],
      assignedUserIds: [],
      optedOutUserIds: []
    }));
  }

  function ensureStageConfig(flow) {
    if (!flow) return createDefaultStageConfig();
    if (Array.isArray(flow.stageConfig) && flow.stageConfig.length) {
      const existingKeys = new Set(flow.stageConfig.map((cfg) => cfg.stageKey));
      const merged = flow.stageConfig.map((cfg) => ({
        stageKey: cfg.stageKey,
        active: Boolean(cfg.active),
        assignedRoleIds: Array.from(new Set(cfg.assignedRoleIds || [])),
        assignedUserIds: Array.from(new Set(cfg.assignedUserIds || [])),
        optedOutUserIds: Array.from(new Set(cfg.optedOutUserIds || []))
      }));

      OPERATORS.forEach((operator) => {
        if (!existingKeys.has(operator.id)) {
          merged.push({
            stageKey: operator.id,
            active: false,
            assignedRoleIds: [],
            assignedUserIds: [],
            optedOutUserIds: []
          });
        }
      });

      return merged.sort((a, b) => {
        const seqA = OPERATOR_INDEX[a.stageKey]?.seq || 0;
        const seqB = OPERATOR_INDEX[b.stageKey]?.seq || 0;
        return seqA - seqB;
      });
    }

    return createDefaultStageConfig();
  }

  function collectUsersForRole(roleId, roles, includeNested, visited) {
    if (!roleId || !roles) return [];
    const role = roles[roleId];
    if (!role || visited.has(roleId)) return [];

    visited.add(roleId);
    const users = new Set(role.userIds || []);

    if (includeNested) {
      const childRoleIds = role.childRoleIds || [];
      childRoleIds.forEach((childId) => {
        collectUsersForRole(childId, roles, true, visited).forEach((userId) => users.add(userId));
      });
    }

    return Array.from(users);
  }

  function isUserInRole(user, roleId, roles, includeNested = true, visited) {
    if (!user || !roleId) return false;
    const roleMap = normalizeRoles(roles);
    const userId = typeof user === 'string' ? user : user.id;
    if (!userId) return false;
    const seen = visited || new Set();
    const role = roleMap[roleId];
    if (!role || seen.has(roleId)) return false;

    if (role.userIds?.includes(userId)) {
      return true;
    }

    if (!includeNested) {
      return false;
    }

    seen.add(roleId);
    return (role.childRoleIds || []).some((childId) => isUserInRole(userId, childId, roleMap, true, seen));
  }

  function getUsersForStage(stageConfig, roles, includeNested = true) {
    if (!stageConfig) return [];
    const roleMap = normalizeRoles(roles);
    const users = new Set(stageConfig.assignedUserIds || []);

    (stageConfig.assignedRoleIds || []).forEach((roleId) => {
      collectUsersForRole(roleId, roleMap, includeNested, new Set()).forEach((userId) => users.add(userId));
    });

    (stageConfig.optedOutUserIds || []).forEach((optOutId) => users.delete(optOutId));

    return Array.from(users);
  }

  function getStageConfig(flow, stageKey) {
    if (!flow) return null;
    return ensureStageConfig(flow).find((cfg) => cfg.stageKey === stageKey) || null;
  }

  function findFirstActiveStage(flow) {
    const stageConfig = ensureStageConfig(flow);
    return stageConfig.find((cfg) => cfg.active) || null;
  }

  function getNextActiveStage(flow, currentStageKey) {
    const stageConfig = ensureStageConfig(flow);
    const currentIndex = stageConfig.findIndex((cfg) => cfg.stageKey === currentStageKey);
    if (currentIndex === -1) {
      return findFirstActiveStage(flow);
    }

    for (let i = currentIndex + 1; i < stageConfig.length; i += 1) {
      if (stageConfig[i].active) {
        return stageConfig[i];
      }
    }

    return null;
  }

  function canUserClaimActivity(user, activity, flow, roles) {
    if (!user || !activity || !flow) return false;
    const stageConfig = getStageConfig(flow, activity.currentStageId);
    if (!stageConfig || !stageConfig.active) return false;

    const userId = typeof user === 'string' ? user : user.id;
    if (!userId) return false;

    if (stageConfig.optedOutUserIds?.includes(userId)) {
      return false;
    }

    if (stageConfig.assignedUserIds?.includes(userId)) {
      return true;
    }

    return (stageConfig.assignedRoleIds || []).some((roleId) => isUserInRole(userId, roleId, roles, true));
  }

  function resolveStageAssignments(flow, roles, includeNested = true) {
    const stageConfig = ensureStageConfig(flow);
    const roleMap = normalizeRoles(roles);

    return stageConfig.map((cfg) => ({
      stageKey: cfg.stageKey,
      active: Boolean(cfg.active),
      assignedRoleIds: Array.from(new Set(cfg.assignedRoleIds || [])),
      assignedUserIds: Array.from(new Set(cfg.assignedUserIds || [])),
      optedOutUserIds: Array.from(new Set(cfg.optedOutUserIds || [])),
      availableUserIds: getUsersForStage(cfg, roleMap, includeNested)
    }));
  }

  function summarizeStageAssignments(flow, roles, includeNested = true) {
    return resolveStageAssignments(flow, roles, includeNested).reduce((acc, cfg) => {
      acc[cfg.stageKey] = cfg;
      return acc;
    }, {});
  }

  function getStageProgress(flow, activity) {
    const stageConfig = ensureStageConfig(flow);
    const activeStages = stageConfig.filter((cfg) => cfg.active);
    const orderedActiveKeys = activeStages.map((cfg) => cfg.stageKey);
    const currentStageId = activity?.currentStageId;
    const currentIndex = orderedActiveKeys.indexOf(currentStageId);

    const completedSet = new Set(
      activity?.completedStageIds ||
        activity?.completedStages ||
        (Array.isArray(activity?.history)
          ? activity.history
              .filter((item) => item?.stageKey && item?.status === 'completed')
              .map((item) => item.stageKey)
          : [])
    );

    const skippedSet = new Set(activity?.skippedStageIds || []);

    const stageLookup = stageConfig.reduce((acc, cfg, index) => {
      acc[cfg.stageKey] = { cfg, index };
      return acc;
    }, {});

    return stageConfig.map((cfg) => {
      const base = {
        stageKey: cfg.stageKey,
        name: OPERATOR_INDEX[cfg.stageKey]?.name || cfg.stageKey,
        description: OPERATOR_INDEX[cfg.stageKey]?.desc || null,
        tier: OPERATOR_INDEX[cfg.stageKey]?.tier || null,
        seq: OPERATOR_INDEX[cfg.stageKey]?.seq || null,
        active: Boolean(cfg.active)
      };

      if (!cfg.active) {
        return { ...base, status: 'skipped' };
      }

      if (skippedSet.has(cfg.stageKey)) {
        return { ...base, status: 'skipped' };
      }

      if (completedSet.has(cfg.stageKey)) {
        return { ...base, status: 'completed' };
      }

      if (cfg.stageKey === currentStageId) {
        return { ...base, status: 'current' };
      }

      if (currentIndex !== -1) {
        const stageIndex = orderedActiveKeys.indexOf(cfg.stageKey);
        if (stageIndex !== -1) {
          if (stageIndex < currentIndex) {
            return { ...base, status: 'completed' };
          }
          if (stageIndex > currentIndex) {
            return { ...base, status: 'upcoming' };
          }
        }
      }

      if (!currentStageId) {
        const firstActive = findFirstActiveStage(flow);
        if (firstActive && firstActive.stageKey === cfg.stageKey) {
          return { ...base, status: 'current' };
        }
        const firstActiveIndex = firstActive ? stageLookup[firstActive.stageKey]?.index ?? -1 : -1;
        if (firstActiveIndex !== -1) {
          const stageIndex = stageLookup[cfg.stageKey]?.index ?? -1;
          if (stageIndex !== -1 && stageIndex < firstActiveIndex) {
            return { ...base, status: 'completed' };
          }
        }
      }

      return { ...base, status: 'upcoming' };
    });
  }

  function flowNeedsStageConfiguration(flow) {
    if (!flow) return true;
    if (!Array.isArray(flow.stageConfig) || flow.stageConfig.length === 0) {
      return true;
    }

    const stageConfig = ensureStageConfig(flow);
    return !stageConfig.some((cfg) => cfg.active);
  }

  function buildRoleHierarchy(roles) {
    const roleMap = normalizeRoles(roles);
    const visited = new Set();

    function buildNode(roleId) {
      if (!roleId || visited.has(roleId)) return null;
      const role = roleMap[roleId];
      if (!role) return null;

      visited.add(roleId);

      const children = (role.childRoleIds || [])
        .map((childId) => buildNode(childId))
        .filter(Boolean);

      const directMembers = Array.from(new Set(role.userIds || []));
      const allMembers = new Set(directMembers);
      children.forEach((child) => {
        child.allMemberIds.forEach((userId) => allMembers.add(userId));
      });

      return {
        id: role.id,
        name: role.name,
        parentRoleId: role.parentRoleId,
        memberIds: directMembers,
        memberCount: directMembers.length,
        allMemberIds: Array.from(allMembers),
        totalMemberCount: allMembers.size,
        childRoles: children
      };
    }

    const nodes = Object.values(roleMap)
      .filter((role) => !role.parentRoleId || !roleMap[role.parentRoleId])
      .map((role) => buildNode(role.id))
      .filter(Boolean);

    const orphanRoles = Object.values(roleMap)
      .filter((role) => !visited.has(role.id))
      .map((role) => buildNode(role.id))
      .filter(Boolean);

    return {
      tree: nodes,
      orphanRoles,
      roleMap
    };
  }

  function migrateRolesToStageConfig(flow, roles) {
    const stageConfig = ensureStageConfig(flow);
    const roleList = Array.isArray(roles) ? roles : Object.values(roles || {});

    const legacyAssignments = stageConfig.reduce((acc, cfg) => {
      acc[cfg.stageKey] = cfg;
      return acc;
    }, {});

    roleList.forEach((role) => {
      const stageKey = role.operatorType;
      if (!stageKey || !legacyAssignments[stageKey]) {
        return;
      }

      legacyAssignments[stageKey].active = true;
      legacyAssignments[stageKey].assignedRoleIds = Array.from(new Set([
        ...(legacyAssignments[stageKey].assignedRoleIds || []),
        role.id
      ]));
    });

    return ensureStageConfig({ stageConfig: Object.values(legacyAssignments) });
  }

  const EOStageFlow = {
    OPERATORS,
    ensureStageConfig,
    createDefaultStageConfig,
    findFirstActiveStage,
    getNextActiveStage,
    getStageConfig,
    getUsersForStage,
    isUserInRole,
    canUserClaimActivity,
    resolveStageAssignments,
    summarizeStageAssignments,
    getStageProgress,
    flowNeedsStageConfiguration,
    buildRoleHierarchy,
    migrateRolesToStageConfig,
    normalizeRole,
    normalizeRoles
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EOStageFlow;
  }

  global.EOStageFlow = EOStageFlow;
})(typeof window !== 'undefined' ? window : globalThis);
