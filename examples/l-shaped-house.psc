units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Generated Plan" {
  footprint polygon [
    (0, 0), (10, 0), (10, 5), (16, 5), (16, 12), (0, 12)
  ]

  # west/front
  room entry {
    rect (7.55, 0) (10, 5)
    label "Entry"
  }
  room kitchen {
    rect (0, 0) (7.55, 5)
    label "Kitchen"
  }

  # west/back
  room living {
    rect (0, 5) (12.4, 12)
    label "Living Room"
  }

  # east/back
  room master {
    rect (12.4, 7.25) (16, 12)
    label "Master Bedroom"
  }
  room ensuite {
    rect (12.4, 5) (16, 7.25)
    label "Ensuite"
  }

  # Openings
  opening door d1 {
    between entry and living
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d2 {
    between entry and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d3 {
    between living and master
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d4 {
    between living and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d5 {
    between ensuite and master
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d6 {
    on entry.edge south
    at 50%
    width 1
  }
  opening window w7 {
    on living.edge north
    at 50%
    width 2.25
  }
  opening window w8 {
    on master.edge east
    at 50%
    width 1.5
  }

  # Validation
  assert no_overlap rooms
  assert inside footprint all_rooms
}