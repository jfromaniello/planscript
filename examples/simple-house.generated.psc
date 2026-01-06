units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Generated Plan" {
  footprint rect (0, 0) (14, 10)

  # public/full
  room living {
    rect (6, 3.7) (10.75, 10)
    label "Living Room"
  }
  room kitchen {
    rect (10.75, 5.65) (14, 10)
    label "Kitchen"
  }

  # private/full
  room master {
    rect (0, 6) (4, 10)
    label "Master Bedroom"
  }
  room bedroom2 {
    rect (0, 2.3) (3.7, 6)
    label "Bedroom 2"
  }
  room bath {
    rect (3.7, 3.15) (5.8, 6)
    label "Bathroom"
  }

  # Openings
  opening door d1 {
    between living and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d2 {
    between bedroom2 and master
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d3 {
    between bath and master
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d4 {
    between bath and bedroom2
    on shared_edge
    at 50%
    width 0.9
  }
  opening window w5 {
    on living.edge north
    at 50%
    width 2.25
  }
  opening window w6 {
    on master.edge north
    at 50%
    width 1.5
  }
  opening window w7 {
    on bedroom2.edge west
    at 50%
    width 1.5
  }

  # Validation
  assert no_overlap rooms
  assert inside footprint all_rooms
}