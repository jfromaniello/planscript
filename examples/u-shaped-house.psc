units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Generated Plan" {
  footprint polygon [
    (0, 0), (18, 0), (18, 14), (12, 14), (12, 5), (6, 5), (6, 14), (0, 14)
  ]

  # center/front
  room foyer {
    rect (6, 0) (12, 4.6)
    label "Entry Foyer"
  }

  # east/front
  room living {
    rect (12, 0) (18, 5)
    label "Living Room"
  }

  # west/front
  room kitchen {
    rect (0, 0) (6, 4.55)
    label "Kitchen"
  }

  # west/back
  room west_hall {
    rect (4, 4.55) (6, 14)
    label "West Hall"
  }
  room bath {
    rect (0, 4.55) (4, 8.85)
    label "Shared Bathroom"
  }
  room bedroom1 {
    rect (0, 8.85) (4, 14)
    label "Bedroom 2"
  }

  # east/back
  room master {
    rect (12, 5) (18, 11.9)
    label "Master Bedroom"
  }
  room ensuite {
    rect (12, 11.9) (18, 14)
    label "Master Ensuite"
  }

  # Openings
  opening door d1 {
    between foyer and living
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d2 {
    between foyer and kitchen
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
    between kitchen and west_hall
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d5 {
    between west_hall and bedroom1
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d6 {
    between bath and west_hall
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d7 {
    between ensuite and master
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d8 {
    on foyer.edge south
    at 50%
    width 1.1
  }
  opening window w9 {
    on living.edge south
    at 50%
    width 1.5
  }
  opening window w10 {
    on bath.edge west
    at 50%
    width 0.75
  }
  opening window w11 {
    on master.edge east
    at 50%
    width 1.5
  }
  opening window w12 {
    on bedroom1.edge west
    at 50%
    width 1.5
  }

  # Validation
  assert no_overlap rooms
  assert inside footprint all_rooms
}