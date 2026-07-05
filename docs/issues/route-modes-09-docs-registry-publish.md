# Docs and registry publish

Status: ready-for-agent (release step may need maintainer review)  
Type: HITL  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Prepare **upstream-facing documentation** and **publish** `trek-plugin-waterway` to the TREK-Plugins community registry.

Deliverables:

- Wiki page: day-plan route modes overview — built-ins vs plugin modes, how to install a route-provider plugin
- Wiki or plugin README: install/activate waterway plugin, permissions, Overpass mirror setting, instance requirements
- Core PR description framed as plugin infrastructure (not a waterways feature)
- Pack plugin artifact; `trek-plugin-sdk publish`; open PR to TREK-Plugins registry
- Declare compatible TREK semver range in plugin manifest

Human review expected for registry PR approval and release tag.

## Acceptance criteria

- [ ] Wiki documents route modes, `/api/route-modes`, and plugin install flow
- [ ] Plugin README complete with screenshot requirement for registry
- [ ] Plugin published and registry PR opened (or merged per project process)
- [ ] Manifest `trek` version range matches core hook availability
- [ ] Core PR / changelog text suitable for upstream maintainers

## Blocked by

- [route-modes-08-waterway-e2e](./route-modes-08-waterway-e2e.md)

## User stories

1, 26
