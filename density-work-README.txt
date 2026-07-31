PARKED: the denser-towns experiment, 31 July 2026
=================================================

This is NOT in the repo, on purpose. It looks better and measures worse.
See HANDOFF.md item 32 for the numbers and the reason.

Apply with, from mike-portfolio-v1/:

    git apply density-work.patch

...but read item 32 first. The blocker is `stepTraffic()` assuming a lane is
long enough to queue on; on a 24-unit block five lanes cannot hold a bus behind
their own stop line. Until that is handled, this costs more traffic quality
than the density gains.

The patch is against the tree as it stood BEFORE the airport and helicopter
work, so islandLayout.js will conflict. The three ideas in it are small and
easier to re-apply by hand than to merge:

  1. DEFAULT_BLOCK_SIZE 34 -> 24, and MIN_STREET_LENGTH tied to it
  2. `grid: true` on the hub in mapData.js (it had no streets at all)
  3. streets slide along the ring to clear a bridge landing rather than
     being deleted; a usefulness test drops streets that neither shorten a
     journey nor cross anything; lights only where a road meets an arterial

Plus two test corrections that are worth keeping either way:
  - town.mjs section 9 demanded signals < junctions, i.e. asserted that some
    pair is ALWAYS close enough to need merging. That is the defect, not a
    property. It is <= now.
  - cityui.mjs drew its test road between two points that were on streets
    only by accident of where the grid fell.
