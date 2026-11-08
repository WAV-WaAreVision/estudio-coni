export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      afirmaciones: {
        Row: {
          autor_id: string
          cita: string
          creada_en: string
          dolor: string | null
          emocion: string | null
          evidencia: string
          excluida: boolean
          gancho: string | null
          id: string
          idioma: string | null
          material_id: string
          postura: string | null
          publico: string | null
          tema_id: string | null
          texto: string
          tipo: string
          tramo: number
          ubicacion: Json
          vector: string | null
        }
        Insert: {
          autor_id: string
          cita: string
          creada_en?: string
          dolor?: string | null
          emocion?: string | null
          evidencia: string
          excluida?: boolean
          gancho?: string | null
          id?: string
          idioma?: string | null
          material_id: string
          postura?: string | null
          publico?: string | null
          tema_id?: string | null
          texto: string
          tipo: string
          tramo: number
          ubicacion: Json
          vector?: string | null
        }
        Update: {
          autor_id?: string
          cita?: string
          creada_en?: string
          dolor?: string | null
          emocion?: string | null
          evidencia?: string
          excluida?: boolean
          gancho?: string | null
          id?: string
          idioma?: string | null
          material_id?: string
          postura?: string | null
          publico?: string | null
          tema_id?: string | null
          texto?: string
          tipo?: string
          tramo?: number
          ubicacion?: Json
          vector?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "afirmaciones_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "autores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afirmaciones_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "autores_visibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afirmaciones_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afirmaciones_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales_visibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afirmaciones_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afirmaciones_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      ajustes: {
        Row: {
          avatar_visto_en: string | null
          avisos_resumen: boolean
          avisos_urgentes: boolean
          destinos_por_defecto: string[]
          dias_publicacion: number[]
          enlaces: Json
          fusiones_nocturnas_activas: boolean
          hora_publicacion: string
          id: boolean
          ideas_por_semana: number
          inventario_desde: string
          limite_duro_usd: number | null
          linkedin_conectado_en: string | null
          linkedin_miembro: string | null
          linkedin_nombre: string | null
          linkedin_token_expira_en: string | null
          linkedin_version_avisada: string | null
          meta: string
          meta_cuenta_id: string | null
          meta_token_expira_en: string | null
          motor_semanal_activo: boolean
          produccion: Json
          revision_de_inventario_avisada: string | null
          tope_mensual_usd: number
          ultima_red: string | null
          zona: string
        }
        Insert: {
          avatar_visto_en?: string | null
          avisos_resumen?: boolean
          avisos_urgentes?: boolean
          destinos_por_defecto?: string[]
          dias_publicacion?: number[]
          enlaces?: Json
          fusiones_nocturnas_activas?: boolean
          hora_publicacion?: string
          id?: boolean
          ideas_por_semana?: number
          inventario_desde?: string
          limite_duro_usd?: number | null
          linkedin_conectado_en?: string | null
          linkedin_miembro?: string | null
          linkedin_nombre?: string | null
          linkedin_token_expira_en?: string | null
          linkedin_version_avisada?: string | null
          meta?: string
          meta_cuenta_id?: string | null
          meta_token_expira_en?: string | null
          motor_semanal_activo?: boolean
          produccion?: Json
          revision_de_inventario_avisada?: string | null
          tope_mensual_usd?: number
          ultima_red?: string | null
          zona?: string
        }
        Update: {
          avatar_visto_en?: string | null
          avisos_resumen?: boolean
          avisos_urgentes?: boolean
          destinos_por_defecto?: string[]
          dias_publicacion?: number[]
          enlaces?: Json
          fusiones_nocturnas_activas?: boolean
          hora_publicacion?: string
          id?: boolean
          ideas_por_semana?: number
          inventario_desde?: string
          limite_duro_usd?: number | null
          linkedin_conectado_en?: string | null
          linkedin_miembro?: string | null
          linkedin_nombre?: string | null
          linkedin_token_expira_en?: string | null
          linkedin_version_avisada?: string | null
          meta?: string
          meta_cuenta_id?: string | null
          meta_token_expira_en?: string | null
          motor_semanal_activo?: boolean
          produccion?: Json
          revision_de_inventario_avisada?: string | null
          tope_mensual_usd?: number
          ultima_red?: string | null
          zona?: string
        }
        Relationships: []
      }
      autores: {
        Row: {
          alias: string[]
          borrar_desde: string | null
          creado_en: string
          creado_por: string | null
          credencial: string | null
          id: string
          nombre: string
          nombre_normalizado: string | null
          tipo: string
        }
        Insert: {
          alias?: string[]
          borrar_desde?: string | null
          creado_en?: string
          creado_por?: string | null
          credencial?: string | null
          id?: string
          nombre: string
          nombre_normalizado?: string | null
          tipo: string
        }
        Update: {
          alias?: string[]
          borrar_desde?: string | null
          creado_en?: string
          creado_por?: string | null
          credencial?: string | null
          id?: string
          nombre?: string
          nombre_normalizado?: string | null
          tipo?: string
        }
        Relationships: []
      }
      avisos: {
        Row: {
          canal: string | null
          clave: string
          creado_en: string
          enviado_en: string | null
          id: string
          leido_en: string | null
          mensaje: string
          pieza_id: string | null
          tipo: string
        }
        Insert: {
          canal?: string | null
          clave: string
          creado_en?: string
          enviado_en?: string | null
          id?: string
          leido_en?: string | null
          mensaje: string
          pieza_id?: string | null
          tipo: string
        }
        Update: {
          canal?: string | null
          clave?: string
          creado_en?: string
          enviado_en?: string | null
          id?: string
          leido_en?: string | null
          mensaje?: string
          pieza_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      avisos_a_federico: {
        Row: {
          clave: string
          creado_en: string
          entidad_id: string
          enviado_en: string | null
          id: string
          reclamado_en: string | null
          tipo: string
        }
        Insert: {
          clave: string
          creado_en?: string
          entidad_id: string
          enviado_en?: string | null
          id?: string
          reclamado_en?: string | null
          tipo: string
        }
        Update: {
          clave?: string
          creado_en?: string
          entidad_id?: string
          enviado_en?: string | null
          id?: string
          reclamado_en?: string | null
          tipo?: string
        }
        Relationships: []
      }
      borradores_de_pilar: {
        Row: {
          creado_en: string
          creado_por: string | null
          decidido_en: string | null
          descripcion: string
          estado: string
          id: string
          nombre: string
          nombre_corto: string
          peso: number
          pilar_id: string | null
          red: string
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          decidido_en?: string | null
          descripcion: string
          estado?: string
          id?: string
          nombre: string
          nombre_corto: string
          peso: number
          pilar_id?: string | null
          red: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          decidido_en?: string | null
          descripcion?: string
          estado?: string
          id?: string
          nombre?: string
          nombre_corto?: string
          peso?: number
          pilar_id?: string | null
          red?: string
        }
        Relationships: [
          {
            foreignKeyName: "borradores_de_pilar_pilar_id_fkey"
            columns: ["pilar_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_de_pilar_pilar_id_fkey"
            columns: ["pilar_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pilar_id"]
          },
        ]
      }
      borradores_de_red: {
        Row: {
          conexion: string
          creado_en: string
          creado_por: string | null
          decidido_en: string | null
          estado: string
          id: string
          manual: string
          nombre: string
          receta: string
        }
        Insert: {
          conexion?: string
          creado_en?: string
          creado_por?: string | null
          decidido_en?: string | null
          estado?: string
          id?: string
          manual?: string
          nombre: string
          receta?: string
        }
        Update: {
          conexion?: string
          creado_en?: string
          creado_por?: string | null
          decidido_en?: string | null
          estado?: string
          id?: string
          manual?: string
          nombre?: string
          receta?: string
        }
        Relationships: []
      }
      carruseles: {
        Row: {
          armado_empezo_en: string | null
          armado_pedido_en: string | null
          creado_en: string
          diseno: Json
          estado: string
          hash_texto: string
          id: string
          laminas: Json
          origen: string
          pdf_clave: string | null
          pedido: string | null
          pieza_id: string
          png_claves: string[]
          texto_post: string
          version: number
        }
        Insert: {
          armado_empezo_en?: string | null
          armado_pedido_en?: string | null
          creado_en?: string
          diseno?: Json
          estado?: string
          hash_texto: string
          id?: string
          laminas: Json
          origen: string
          pdf_clave?: string | null
          pedido?: string | null
          pieza_id: string
          png_claves?: string[]
          texto_post: string
          version: number
        }
        Update: {
          armado_empezo_en?: string | null
          armado_pedido_en?: string | null
          creado_en?: string
          diseno?: Json
          estado?: string
          hash_texto?: string
          id?: string
          laminas?: Json
          origen?: string
          pdf_clave?: string | null
          pedido?: string | null
          pieza_id?: string
          png_claves?: string[]
          texto_post?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "carruseles_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carruseles_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      categorias: {
        Row: {
          activa: boolean
          creada_en: string
          creada_por: string | null
          descripcion: string | null
          es_capa: boolean
          es_pilar: boolean
          id: string
          nombre: string
          nombre_corto: string | null
          nombre_normalizado: string | null
          orden: number | null
          red: string | null
          slug: string
        }
        Insert: {
          activa?: boolean
          creada_en?: string
          creada_por?: string | null
          descripcion?: string | null
          es_capa?: boolean
          es_pilar?: boolean
          id?: string
          nombre: string
          nombre_corto?: string | null
          nombre_normalizado?: string | null
          orden?: number | null
          red?: string | null
          slug: string
        }
        Update: {
          activa?: boolean
          creada_en?: string
          creada_por?: string | null
          descripcion?: string | null
          es_capa?: boolean
          es_pilar?: boolean
          id?: string
          nombre?: string
          nombre_corto?: string | null
          nombre_normalizado?: string | null
          orden?: number | null
          red?: string | null
          slug?: string
        }
        Relationships: []
      }
      clics_enlace_dia: {
        Row: {
          clics: number
          dia: string
          enlace: string
        }
        Insert: {
          clics?: number
          dia: string
          enlace: string
        }
        Update: {
          clics?: number
          dia?: string
          enlace?: string
        }
        Relationships: []
      }
      consultas: {
        Row: {
          anotada_en: string
          id: string
        }
        Insert: {
          anotada_en?: string
          id?: string
        }
        Update: {
          anotada_en?: string
          id?: string
        }
        Relationships: []
      }
      embeddings_ficha: {
        Row: {
          creado_en: string
          material_id: string
          modelo: string
          vector: string
        }
        Insert: {
          creado_en?: string
          material_id: string
          modelo: string
          vector: string
        }
        Update: {
          creado_en?: string
          material_id?: string
          modelo?: string
          vector?: string
        }
        Relationships: [
          {
            foreignKeyName: "embeddings_ficha_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: true
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embeddings_ficha_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: true
            referencedRelation: "materiales_visibles"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          actor_rol: string
          actor_usuario: string | null
          datos: Json | null
          en: string
          id: number
          operacion: string
          pieza_id: string | null
          tabla: string
        }
        Insert: {
          actor_rol: string
          actor_usuario?: string | null
          datos?: Json | null
          en?: string
          id?: never
          operacion: string
          pieza_id?: string | null
          tabla: string
        }
        Update: {
          actor_rol?: string
          actor_usuario?: string | null
          datos?: Json | null
          en?: string
          id?: never
          operacion?: string
          pieza_id?: string | null
          tabla?: string
        }
        Relationships: []
      }
      fechas_propuestas: {
        Row: {
          pieza_id: string
          propuesta_en: string
          publicar_en: string
        }
        Insert: {
          pieza_id: string
          propuesta_en?: string
          publicar_en: string
        }
        Update: {
          pieza_id?: string
          propuesta_en?: string
          publicar_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechas_propuestas_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: true
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechas_propuestas_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: true
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      fichas: {
        Row: {
          citas: Json
          editada_en: string | null
          editada_por: string | null
          fuente: Json
          ideas_clave: Json
          material_id: string
          resumen: string
        }
        Insert: {
          citas: Json
          editada_en?: string | null
          editada_por?: string | null
          fuente: Json
          ideas_clave: Json
          material_id: string
          resumen: string
        }
        Update: {
          citas?: Json
          editada_en?: string | null
          editada_por?: string | null
          fuente?: Json
          ideas_clave?: Json
          material_id?: string
          resumen?: string
        }
        Relationships: [
          {
            foreignKeyName: "fichas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: true
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: true
            referencedRelation: "materiales_visibles"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
          reservado_por: string | null
          sin_cobro: boolean
        }
        Insert: {
          clave: string
          creado_en?: string
          estado?: string
          estimado_usd: number
          id?: never
          mes: string
          paso: string
          pieza_id?: string | null
          proveedor: string
          real_usd?: number | null
          reservado_por?: string | null
          sin_cobro?: boolean
        }
        Update: {
          clave?: string
          creado_en?: string
          estado?: string
          estimado_usd?: number
          id?: never
          mes?: string
          paso?: string
          pieza_id?: string | null
          proveedor?: string
          real_usd?: number | null
          reservado_por?: string | null
          sin_cobro?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gastos_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      guias: {
        Row: {
          creada_en: string
          texto: string
          version: number
          vigente: boolean
        }
        Insert: {
          creada_en?: string
          texto: string
          version: number
          vigente?: boolean
        }
        Update: {
          creada_en?: string
          texto?: string
          version?: number
          vigente?: boolean
        }
        Relationships: []
      }
      guion_versiones: {
        Row: {
          autor: string
          creada_en: string
          creada_por: string | null
          guion: string
          numero: number
          pieza_id: string
          texto: string | null
        }
        Insert: {
          autor: string
          creada_en?: string
          creada_por?: string | null
          guion: string
          numero: number
          pieza_id: string
          texto?: string | null
        }
        Update: {
          autor?: string
          creada_en?: string
          creada_por?: string | null
          guion?: string
          numero?: number
          pieza_id?: string
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guion_versiones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guion_versiones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      ideas: {
        Row: {
          alertas: Json
          angulo_id: string | null
          creada_en: string
          descartada_en: string | null
          descartada_por: string | null
          estado: string
          fijada_en: string | null
          formato: string
          fuentes: Json
          fuerza: string
          gancho: string
          id: string
          motivo_descarte: string | null
          numero: number | null
          origen: string
          pilar: string
          semana: string | null
          tema: string
          teoria_id: string | null
        }
        Insert: {
          alertas?: Json
          angulo_id?: string | null
          creada_en?: string
          descartada_en?: string | null
          descartada_por?: string | null
          estado?: string
          fijada_en?: string | null
          formato?: string
          fuentes?: Json
          fuerza: string
          gancho: string
          id?: string
          motivo_descarte?: string | null
          numero?: number | null
          origen?: string
          pilar: string
          semana?: string | null
          tema?: string
          teoria_id?: string | null
        }
        Update: {
          alertas?: Json
          angulo_id?: string | null
          creada_en?: string
          descartada_en?: string | null
          descartada_por?: string | null
          estado?: string
          fijada_en?: string | null
          formato?: string
          fuentes?: Json
          fuerza?: string
          gancho?: string
          id?: string
          motivo_descarte?: string | null
          numero?: number | null
          origen?: string
          pilar?: string
          semana?: string | null
          tema?: string
          teoria_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ideas_angulo_id_fkey"
            columns: ["angulo_id"]
            isOneToOne: false
            referencedRelation: "pilar_angulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_pilar_fkey"
            columns: ["pilar"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "ideas_teoria_id_fkey"
            columns: ["teoria_id"]
            isOneToOne: false
            referencedRelation: "teorias"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas_pilar_antes: {
        Row: {
          idea_id: string
          lote: string
          pilar: string
        }
        Insert: {
          idea_id: string
          lote: string
          pilar: string
        }
        Update: {
          idea_id?: string
          lote?: string
          pilar?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_pilar_antes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_pilar_antes_lote_fkey"
            columns: ["lote"]
            isOneToOne: false
            referencedRelation: "lotes_de_pilares"
            referencedColumns: ["lote"]
          },
          {
            foreignKeyName: "ideas_pilar_antes_pilar_fkey"
            columns: ["pilar"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["slug"]
          },
        ]
      }
      intervenciones: {
        Row: {
          canal: string
          en: string
          id: number
          pieza_id: string | null
          que: string
          quien: string
          registrada_por: string | null
        }
        Insert: {
          canal: string
          en?: string
          id?: never
          pieza_id?: string | null
          que: string
          quien: string
          registrada_por?: string | null
        }
        Update: {
          canal?: string
          en?: string
          id?: never
          pieza_id?: string | null
          que?: string
          quien?: string
          registrada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intervenciones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervenciones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      inventario_de_datos: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          clave: string
          dato: string
          id: string
          orden: number
          pais: string
          pais_confirmado: boolean
          para_que: string
          plazo: string
          plazo_dias: number | null
          proveedor: string
          regla_de_borrado: string | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          clave: string
          dato: string
          id?: string
          orden: number
          pais: string
          pais_confirmado?: boolean
          para_que: string
          plazo: string
          plazo_dias?: number | null
          proveedor: string
          regla_de_borrado?: string | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          clave?: string
          dato?: string
          id?: string
          orden?: number
          pais?: string
          pais_confirmado?: boolean
          para_que?: string
          plazo?: string
          plazo_dias?: number | null
          proveedor?: string
          regla_de_borrado?: string | null
        }
        Relationships: []
      }
      limites_del_mes: {
        Row: {
          fijado_en: string
          fijado_por: string
          limite_usd: number
          mes: string
        }
        Insert: {
          fijado_en?: string
          fijado_por: string
          limite_usd: number
          mes: string
        }
        Update: {
          fijado_en?: string
          fijado_por?: string
          limite_usd?: number
          mes?: string
        }
        Relationships: []
      }
      lote_pilares_retirados: {
        Row: {
          lote: string
          pilar_id: string
        }
        Insert: {
          lote: string
          pilar_id: string
        }
        Update: {
          lote?: string
          pilar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lote_pilares_retirados_lote_fkey"
            columns: ["lote"]
            isOneToOne: false
            referencedRelation: "lotes_de_pilares"
            referencedColumns: ["lote"]
          },
          {
            foreignKeyName: "lote_pilares_retirados_pilar_id_fkey"
            columns: ["pilar_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_pilares_retirados_pilar_id_fkey"
            columns: ["pilar_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pilar_id"]
          },
        ]
      }
      lotes_de_pilares: {
        Row: {
          aplicado_en: string
          lote: string
        }
        Insert: {
          aplicado_en?: string
          lote: string
        }
        Update: {
          aplicado_en?: string
          lote?: string
        }
        Relationships: []
      }
      materiales: {
        Row: {
          anio: number | null
          archivo_clave: string | null
          autor: string | null
          autor_id: string
          borrar_desde: string | null
          categoria_id: string | null
          corrida_desde: string | null
          corrida_id: string | null
          costo_confirmado_en: string | null
          costo_estimado_usd: number | null
          creado_en: string
          declaracion_sin_pacientes_en: string
          en_cola_desde: string
          estado: string
          etiquetas: string[]
          id: string
          idioma_original: string | null
          motivo_fallo: string | null
          origen_url: string | null
          rol: string
          subido_por: string
          texto_clave: string | null
          texto_pegado: string | null
          tipo: string
          titulo: string | null
        }
        Insert: {
          anio?: number | null
          archivo_clave?: string | null
          autor?: string | null
          autor_id: string
          borrar_desde?: string | null
          categoria_id?: string | null
          corrida_desde?: string | null
          corrida_id?: string | null
          costo_confirmado_en?: string | null
          costo_estimado_usd?: number | null
          creado_en?: string
          declaracion_sin_pacientes_en: string
          en_cola_desde?: string
          estado?: string
          etiquetas?: string[]
          id?: string
          idioma_original?: string | null
          motivo_fallo?: string | null
          origen_url?: string | null
          rol?: string
          subido_por?: string
          texto_clave?: string | null
          texto_pegado?: string | null
          tipo: string
          titulo?: string | null
        }
        Update: {
          anio?: number | null
          archivo_clave?: string | null
          autor?: string | null
          autor_id?: string
          borrar_desde?: string | null
          categoria_id?: string | null
          corrida_desde?: string | null
          corrida_id?: string | null
          costo_confirmado_en?: string | null
          costo_estimado_usd?: number | null
          creado_en?: string
          declaracion_sin_pacientes_en?: string
          en_cola_desde?: string
          estado?: string
          etiquetas?: string[]
          id?: string
          idioma_original?: string | null
          motivo_fallo?: string | null
          origen_url?: string | null
          rol?: string
          subido_por?: string
          texto_clave?: string | null
          texto_pegado?: string | null
          tipo?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materiales_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "autores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "autores_visibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pilar_id"]
          },
        ]
      }
      materiales_archivos: {
        Row: {
          archivo_clave: string
          material_id: string
          orden: number
        }
        Insert: {
          archivo_clave: string
          material_id: string
          orden: number
        }
        Update: {
          archivo_clave?: string
          material_id?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "materiales_archivos_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_archivos_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales_visibles"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas_cuenta: {
        Row: {
          dia: string
          leido_en: string
          toques_perfil: number
        }
        Insert: {
          dia: string
          leido_en?: string
          toques_perfil: number
        }
        Update: {
          dia?: string
          leido_en?: string
          toques_perfil?: number
        }
        Relationships: []
      }
      metricas_linkedin: {
        Row: {
          anotado_en: string
          anotado_por: string | null
          comentarios: number | null
          compartidos: number | null
          impresiones: number | null
          medido_en: string
          origen: string
          pieza_id: string
          reacciones: number | null
        }
        Insert: {
          anotado_en?: string
          anotado_por?: string | null
          comentarios?: number | null
          compartidos?: number | null
          impresiones?: number | null
          medido_en: string
          origen: string
          pieza_id: string
          reacciones?: number | null
        }
        Update: {
          anotado_en?: string
          anotado_por?: string | null
          comentarios?: number | null
          compartidos?: number | null
          impresiones?: number | null
          medido_en?: string
          origen?: string
          pieza_id?: string
          reacciones?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_linkedin_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_linkedin_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      metricas_linkedin_cuenta: {
        Row: {
          anotado_en: string
          anotado_por: string | null
          origen: string
          seguidores: number
          semana: string
        }
        Insert: {
          anotado_en?: string
          anotado_por?: string | null
          origen: string
          seguidores: number
          semana: string
        }
        Update: {
          anotado_en?: string
          anotado_por?: string | null
          origen?: string
          seguidores?: number
          semana?: string
        }
        Relationships: []
      }
      metricas_reel: {
        Row: {
          alcance: number | null
          comentarios: number | null
          compartidos: number | null
          dia: string
          guardados: number | null
          leido_en: string
          pieza_id: string
          tiempo_promedio: number | null
        }
        Insert: {
          alcance?: number | null
          comentarios?: number | null
          compartidos?: number | null
          dia: string
          guardados?: number | null
          leido_en?: string
          pieza_id: string
          tiempo_promedio?: number | null
        }
        Update: {
          alcance?: number | null
          comentarios?: number | null
          compartidos?: number | null
          dia?: string
          guardados?: number | null
          leido_en?: string
          pieza_id?: string
          tiempo_promedio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_reel_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_reel_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      miembros: {
        Row: {
          creado_en: string
          rol: string
          user_id: string
        }
        Insert: {
          creado_en?: string
          rol: string
          user_id: string
        }
        Update: {
          creado_en?: string
          rol?: string
          user_id?: string
        }
        Relationships: []
      }
      motor_corridas: {
        Row: {
          costo_usd: number
          creada_en: string
          estado: string
          id: string
          motivo_fallo: string | null
          resumen: Json
          semana: string
          terminada_en: string | null
        }
        Insert: {
          costo_usd?: number
          creada_en?: string
          estado?: string
          id?: string
          motivo_fallo?: string | null
          resumen?: Json
          semana: string
          terminada_en?: string | null
        }
        Update: {
          costo_usd?: number
          creada_en?: string
          estado?: string
          id?: string
          motivo_fallo?: string | null
          resumen?: Json
          semana?: string
          terminada_en?: string | null
        }
        Relationships: []
      }
      pausas_de_proveedor: {
        Row: {
          avisada_en: string | null
          aviso_reclamado_en: string | null
          cerrada_en: string | null
          desde: string
          detalle: string
          id: string
          motivo: string
          proveedor: string
        }
        Insert: {
          avisada_en?: string | null
          aviso_reclamado_en?: string | null
          cerrada_en?: string | null
          desde?: string
          detalle: string
          id?: string
          motivo: string
          proveedor: string
        }
        Update: {
          avisada_en?: string | null
          aviso_reclamado_en?: string | null
          cerrada_en?: string | null
          desde?: string
          detalle?: string
          id?: string
          motivo?: string
          proveedor?: string
        }
        Relationships: []
      }
      piezas: {
        Row: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        Insert: {
          actualizada_en?: string
          archivos_borrados_en?: string | null
          audio_id?: string | null
          avatar_id?: string | null
          cambios_de_texto?: number
          contenedor_clave?: string | null
          contenedor_id?: string | null
          creada_en?: string
          destinos?: string[]
          estado?: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error?:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion?: string | null
          guion?: string | null
          id?: string
          idea_id?: string | null
          intento?: number
          media_id?: string | null
          pedido_de_cambio?: string | null
          permalink?: string | null
          publicacion_enviada_en?: string | null
          publicacion_reclamada_hasta?: string | null
          puerta1_en?: string | null
          puerta1_formula?: number | null
          puerta1_hash?: string | null
          puerta1_por?: string | null
          puerta2_carrusel_id?: string | null
          puerta2_en?: string | null
          puerta2_formula?: number | null
          puerta2_hash_texto?: string | null
          puerta2_por?: string | null
          puerta2_publicar_en?: string | null
          puerta2_video_id?: string | null
          render_id?: string | null
          respaldo?: Json | null
          revision?: Json
          texto?: string | null
          texto_linkedin?: string | null
          tipo?: string
          titulo: string
          version?: number
          video_id?: string | null
        }
        Update: {
          actualizada_en?: string
          archivos_borrados_en?: string | null
          audio_id?: string | null
          avatar_id?: string | null
          cambios_de_texto?: number
          contenedor_clave?: string | null
          contenedor_id?: string | null
          creada_en?: string
          destinos?: string[]
          estado?: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error?:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion?: string | null
          guion?: string | null
          id?: string
          idea_id?: string | null
          intento?: number
          media_id?: string | null
          pedido_de_cambio?: string | null
          permalink?: string | null
          publicacion_enviada_en?: string | null
          publicacion_reclamada_hasta?: string | null
          puerta1_en?: string | null
          puerta1_formula?: number | null
          puerta1_hash?: string | null
          puerta1_por?: string | null
          puerta2_carrusel_id?: string | null
          puerta2_en?: string | null
          puerta2_formula?: number | null
          puerta2_hash_texto?: string | null
          puerta2_por?: string | null
          puerta2_publicar_en?: string | null
          puerta2_video_id?: string | null
          render_id?: string | null
          respaldo?: Json | null
          revision?: Json
          texto?: string | null
          texto_linkedin?: string | null
          tipo?: string
          titulo?: string
          version?: number
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "piezas_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "puerta2_carrusel_de_la_pieza"
            columns: ["puerta2_carrusel_id", "id"]
            isOneToOne: false
            referencedRelation: "carruseles"
            referencedColumns: ["id", "pieza_id"]
          },
        ]
      }
      pilar_angulos: {
        Row: {
          descripcion: string
          es_capa: boolean
          id: string
          minimo: number | null
          nombre: string
          orden: number
          pilar_id: string
          red: string | null
          slug: string
        }
        Insert: {
          descripcion: string
          es_capa?: boolean
          id?: string
          minimo?: number | null
          nombre: string
          orden: number
          pilar_id: string
          red?: string | null
          slug: string
        }
        Update: {
          descripcion?: string
          es_capa?: boolean
          id?: string
          minimo?: number | null
          nombre?: string
          orden?: number
          pilar_id?: string
          red?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilar_angulos_pilar"
            columns: ["pilar_id", "red", "es_capa"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id", "red", "es_capa"]
          },
        ]
      }
      pilar_pesos: {
        Row: {
          desde: string
          es_capa: boolean
          peso: number
          pilar_id: string
          red: string | null
        }
        Insert: {
          desde: string
          es_capa?: boolean
          peso: number
          pilar_id: string
          red?: string | null
        }
        Update: {
          desde?: string
          es_capa?: boolean
          peso?: number
          pilar_id?: string
          red?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilar_pesos_pilar"
            columns: ["pilar_id", "red", "es_capa"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id", "red", "es_capa"]
          },
        ]
      }
      publicaciones: {
        Row: {
          destino: string
          documento_urn: string | null
          enlace: string | null
          enviado_en: string | null
          estado: string
          explicacion: string | null
          hash_enviado: string | null
          intentos: number
          marcado_en: string | null
          marcado_por: string | null
          pieza_id: string
          post_urn: string | null
          ultimo_error: string | null
          video_urn: string | null
        }
        Insert: {
          destino: string
          documento_urn?: string | null
          enlace?: string | null
          enviado_en?: string | null
          estado: string
          explicacion?: string | null
          hash_enviado?: string | null
          intentos?: number
          marcado_en?: string | null
          marcado_por?: string | null
          pieza_id: string
          post_urn?: string | null
          ultimo_error?: string | null
          video_urn?: string | null
        }
        Update: {
          destino?: string
          documento_urn?: string | null
          enlace?: string | null
          enviado_en?: string | null
          estado?: string
          explicacion?: string | null
          hash_enviado?: string | null
          intentos?: number
          marcado_en?: string | null
          marcado_por?: string | null
          pieza_id?: string
          post_urn?: string | null
          ultimo_error?: string | null
          video_urn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publicaciones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publicaciones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      recordatorios_linkedin: {
        Row: {
          avisado_en: string
          semana: string
        }
        Insert: {
          avisado_en?: string
          semana: string
        }
        Update: {
          avisado_en?: string
          semana?: string
        }
        Relationships: []
      }
      registro_de_borrados: {
        Row: {
          borrado_en: string
          cantidad: number
          id: string
          regla: string
        }
        Insert: {
          borrado_en?: string
          cantidad: number
          id?: string
          regla: string
        }
        Update: {
          borrado_en?: string
          cantidad?: number
          id?: string
          regla?: string
        }
        Relationships: []
      }
      revisiones_de_inventario: {
        Row: {
          id: string
          revisado_en: string
          revisado_por: string | null
        }
        Insert: {
          id?: string
          revisado_en?: string
          revisado_por?: string | null
        }
        Update: {
          id?: string
          revisado_en?: string
          revisado_por?: string | null
        }
        Relationships: []
      }
      suscripciones_push: {
        Row: {
          auth: string
          creada_en: string
          endpoint: string
          fallos: number
          id: string
          p256dh: string
          ultimo_ok_en: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          creada_en?: string
          endpoint: string
          fallos?: number
          id?: string
          p256dh: string
          ultimo_ok_en?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          auth?: string
          creada_en?: string
          endpoint?: string
          fallos?: number
          id?: string
          p256dh?: string
          ultimo_ok_en?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tema_pilares: {
        Row: {
          creado_en: string
          es_capa: boolean
          fuerza: string | null
          lote: string | null
          origen: string
          pilar_id: string
          red: string
          tema_id: string
        }
        Insert: {
          creado_en?: string
          es_capa: boolean
          fuerza?: string | null
          lote?: string | null
          origen: string
          pilar_id: string
          red: string
          tema_id: string
        }
        Update: {
          creado_en?: string
          es_capa?: boolean
          fuerza?: string | null
          lote?: string | null
          origen?: string
          pilar_id?: string
          red?: string
          tema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tema_pilares_pilar"
            columns: ["pilar_id", "red", "es_capa"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id", "red", "es_capa"]
          },
          {
            foreignKeyName: "tema_pilares_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tema_pilares_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      temas: {
        Row: {
          actualizado_en: string
          alias: string[]
          categoria_id: string | null
          centroide: string
          creado_en: string
          descripcion: string | null
          fusionado_en: string | null
          id: string
          nombre: string
          nombre_normalizado: string | null
        }
        Insert: {
          actualizado_en?: string
          alias?: string[]
          categoria_id?: string | null
          centroide: string
          creado_en?: string
          descripcion?: string | null
          fusionado_en?: string | null
          id?: string
          nombre: string
          nombre_normalizado?: string | null
        }
        Update: {
          actualizado_en?: string
          alias?: string[]
          categoria_id?: string | null
          centroide?: string
          creado_en?: string
          descripcion?: string | null
          fusionado_en?: string | null
          id?: string
          nombre?: string
          nombre_normalizado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pilar_id"]
          },
          {
            foreignKeyName: "temas_fusionado_en_fkey"
            columns: ["fusionado_en"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusionado_en_fkey"
            columns: ["fusionado_en"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      temas_fusion_rechazada: {
        Row: {
          rechazada_en: string
          tema_a: string
          tema_b: string
        }
        Insert: {
          rechazada_en?: string
          tema_a: string
          tema_b: string
        }
        Update: {
          rechazada_en?: string
          tema_a?: string
          tema_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "temas_fusion_rechazada_tema_a_fkey"
            columns: ["tema_a"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusion_rechazada_tema_a_fkey"
            columns: ["tema_a"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusion_rechazada_tema_b_fkey"
            columns: ["tema_b"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusion_rechazada_tema_b_fkey"
            columns: ["tema_b"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      teoria_afirmaciones: {
        Row: {
          afirmacion_id: string
          aporte: string
          teoria_id: string
        }
        Insert: {
          afirmacion_id: string
          aporte: string
          teoria_id: string
        }
        Update: {
          afirmacion_id?: string
          aporte?: string
          teoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teoria_afirmaciones_afirmacion_id_fkey"
            columns: ["afirmacion_id"]
            isOneToOne: false
            referencedRelation: "afirmaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teoria_afirmaciones_teoria_id_fkey"
            columns: ["teoria_id"]
            isOneToOne: false
            referencedRelation: "teorias"
            referencedColumns: ["id"]
          },
        ]
      }
      teoria_fuentes: {
        Row: {
          material_id: string
          teoria_id: string
        }
        Insert: {
          material_id: string
          teoria_id: string
        }
        Update: {
          material_id?: string
          teoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teoria_fuentes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teoria_fuentes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales_visibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teoria_fuentes_teoria_id_fkey"
            columns: ["teoria_id"]
            isOneToOne: false
            referencedRelation: "teorias"
            referencedColumns: ["id"]
          },
        ]
      }
      teorias: {
        Row: {
          advertencias: Json
          argumentos: Json | null
          categoria_id: string | null
          componentes: Json | null
          contradicciones: Json | null
          creada_en: string
          creada_por: string | null
          editada_en: string | null
          estado: string
          id: string
          motivo_codigo: string | null
          motivo_fallo: string | null
          nivel_evidencia: string | null
          origen: string
          por_que: string | null
          puntaje: number | null
          semana: string | null
          sintetizando_desde: string
          temas: string[]
          tesis: string | null
          titulo: string | null
        }
        Insert: {
          advertencias?: Json
          argumentos?: Json | null
          categoria_id?: string | null
          componentes?: Json | null
          contradicciones?: Json | null
          creada_en?: string
          creada_por?: string | null
          editada_en?: string | null
          estado?: string
          id?: string
          motivo_codigo?: string | null
          motivo_fallo?: string | null
          nivel_evidencia?: string | null
          origen?: string
          por_que?: string | null
          puntaje?: number | null
          semana?: string | null
          sintetizando_desde?: string
          temas?: string[]
          tesis?: string | null
          titulo?: string | null
        }
        Update: {
          advertencias?: Json
          argumentos?: Json | null
          categoria_id?: string | null
          componentes?: Json | null
          contradicciones?: Json | null
          creada_en?: string
          creada_por?: string | null
          editada_en?: string | null
          estado?: string
          id?: string
          motivo_codigo?: string | null
          motivo_fallo?: string | null
          nivel_evidencia?: string | null
          origen?: string
          por_que?: string | null
          puntaje?: number | null
          semana?: string | null
          sintetizando_desde?: string
          temas?: string[]
          tesis?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pilar_id"]
          },
        ]
      }
      transparencia_versiones: {
        Row: {
          creada_en: string
          creada_por: string | null
          id: string
          motivo: string
          propuesta: boolean
          texto: string
          version: number
          vigente: boolean
        }
        Insert: {
          creada_en?: string
          creada_por?: string | null
          id?: string
          motivo: string
          propuesta?: boolean
          texto: string
          version: number
          vigente?: boolean
        }
        Update: {
          creada_en?: string
          creada_por?: string | null
          id?: string
          motivo?: string
          propuesta?: boolean
          texto?: string
          version?: number
          vigente?: boolean
        }
        Relationships: []
      }
      vinculos: {
        Row: {
          cita_a: string | null
          cita_b: string | null
          creado_en: string
          decidido_en: string | null
          decidido_por: string | null
          estado: string
          material_a: string
          material_b: string
          razon: string | null
          relevancia: number
          tipo: string
        }
        Insert: {
          cita_a?: string | null
          cita_b?: string | null
          creado_en?: string
          decidido_en?: string | null
          decidido_por?: string | null
          estado?: string
          material_a: string
          material_b: string
          razon?: string | null
          relevancia: number
          tipo: string
        }
        Update: {
          cita_a?: string | null
          cita_b?: string | null
          creado_en?: string
          decidido_en?: string | null
          decidido_por?: string | null
          estado?: string
          material_a?: string
          material_b?: string
          razon?: string | null
          relevancia?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_material_a_fkey"
            columns: ["material_a"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_material_a_fkey"
            columns: ["material_a"]
            isOneToOne: false
            referencedRelation: "materiales_visibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_material_b_fkey"
            columns: ["material_b"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_material_b_fkey"
            columns: ["material_b"]
            isOneToOne: false
            referencedRelation: "materiales_visibles"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas_clic: {
        Row: {
          dia: string
          enlace: string
          visitante: string
        }
        Insert: {
          dia: string
          enlace: string
          visitante: string
        }
        Update: {
          dia?: string
          enlace?: string
          visitante?: string
        }
        Relationships: []
      }
    }
    Views: {
      autores_visibles: {
        Row: {
          alias: string[] | null
          borrar_desde: string | null
          creado_en: string | null
          creado_por: string | null
          credencial: string | null
          id: string | null
          nombre: string | null
          nombre_normalizado: string | null
          tipo: string | null
        }
        Insert: {
          alias?: string[] | null
          borrar_desde?: string | null
          creado_en?: string | null
          creado_por?: string | null
          credencial?: string | null
          id?: string | null
          nombre?: string | null
          nombre_normalizado?: string | null
          tipo?: string | null
        }
        Update: {
          alias?: string[] | null
          borrar_desde?: string | null
          creado_en?: string | null
          creado_por?: string | null
          credencial?: string | null
          id?: string | null
          nombre?: string | null
          nombre_normalizado?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      materiales_visibles: {
        Row: {
          anio: number | null
          archivo_clave: string | null
          autor: string | null
          autor_id: string | null
          borrar_desde: string | null
          categoria_id: string | null
          corrida_desde: string | null
          corrida_id: string | null
          costo_confirmado_en: string | null
          costo_estimado_usd: number | null
          creado_en: string | null
          declaracion_sin_pacientes_en: string | null
          estado: string | null
          etiquetas: string[] | null
          id: string | null
          idioma_original: string | null
          motivo_fallo: string | null
          origen_url: string | null
          rol: string | null
          subido_por: string | null
          texto_clave: string | null
          texto_pegado: string | null
          tipo: string | null
          titulo: string | null
        }
        Insert: {
          anio?: number | null
          archivo_clave?: string | null
          autor?: string | null
          autor_id?: string | null
          borrar_desde?: string | null
          categoria_id?: string | null
          corrida_desde?: string | null
          corrida_id?: string | null
          costo_confirmado_en?: string | null
          costo_estimado_usd?: number | null
          creado_en?: string | null
          declaracion_sin_pacientes_en?: string | null
          estado?: string | null
          etiquetas?: string[] | null
          id?: string | null
          idioma_original?: string | null
          motivo_fallo?: string | null
          origen_url?: string | null
          rol?: string | null
          subido_por?: string | null
          texto_clave?: string | null
          texto_pegado?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Update: {
          anio?: number | null
          archivo_clave?: string | null
          autor?: string | null
          autor_id?: string | null
          borrar_desde?: string | null
          categoria_id?: string | null
          corrida_desde?: string | null
          corrida_id?: string | null
          costo_confirmado_en?: string | null
          costo_estimado_usd?: number | null
          creado_en?: string | null
          declaracion_sin_pacientes_en?: string | null
          estado?: string | null
          etiquetas?: string[] | null
          id?: string | null
          idioma_original?: string | null
          motivo_fallo?: string | null
          origen_url?: string | null
          rol?: string | null
          subido_por?: string | null
          texto_clave?: string | null
          texto_pegado?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materiales_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "autores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "autores_visibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pilar_id"]
          },
        ]
      }
      metricas_linkedin_ultima: {
        Row: {
          comentarios: number | null
          compartidos: number | null
          impresiones: number | null
          medido_en: string | null
          origen: string | null
          pieza_id: string | null
          reacciones: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_linkedin_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_linkedin_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      metricas_reel_ultima: {
        Row: {
          alcance: number | null
          comentarios: number | null
          compartidos: number | null
          dia: string | null
          guardados: number | null
          pieza_id: string | null
          tiempo_promedio: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_reel_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_reel_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pieza_id"]
          },
        ]
      }
      piezas_con_angulo: {
        Row: {
          angulo_id: string | null
          pieza_id: string | null
          pilar_id: string | null
          publicada_en: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ideas_angulo_id_fkey"
            columns: ["angulo_id"]
            isOneToOne: false
            referencedRelation: "pilar_angulos"
            referencedColumns: ["id"]
          },
        ]
      }
      temas_resumen: {
        Row: {
          actualizado_en: string | null
          afirmaciones: number | null
          alias: string[] | null
          autores: number | null
          categoria_id: string | null
          creado_en: string | null
          cubierto_por_coni: boolean | null
          descripcion: string | null
          evidencia: Json | null
          id: string | null
          nombre: string | null
          ultima_afirmacion: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "piezas_con_angulo"
            referencedColumns: ["pilar_id"]
          },
        ]
      }
      temas_tratados: {
        Row: {
          red: string | null
          tema_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      abrir_pausa_de_proveedor: {
        Args: { p_detalle: string; p_motivo: string; p_proveedor: string }
        Returns: {
          avisar: boolean
          nueva: boolean
          pausa_id: string
        }[]
      }
      anotar_numeros_linkedin: {
        Args: {
          p_medido_en: string
          p_posts: Json
          p_seguidores?: number
          p_semana: string
        }
        Returns: undefined
      }
      aplicar_lote_de_pilares: {
        Args: { p_filas: Json; p_lote: string }
        Returns: Json
      }
      aprobar_borrador_de_pilar: {
        Args: { p_borrador: string; p_pesos: Json }
        Returns: string
      }
      archivar_ideas_de_pilares_retirados: { Args: never; Returns: number }
      archivar_ideas_del_motor: { Args: { p_semanas: number }; Returns: number }
      borrar_autor: { Args: { p_id: string }; Returns: undefined }
      borrar_lo_marcado: { Args: { p_antes: string }; Returns: string[] }
      cambiar_diseno_de_carrusel: {
        Args: {
          p_diseno: Json
          p_laminas: Json
          p_pieza: string
          p_version: number
        }
        Returns: {
          armado_empezo_en: string | null
          armado_pedido_en: string | null
          creado_en: string
          diseno: Json
          estado: string
          hash_texto: string
          id: string
          laminas: Json
          origen: string
          pdf_clave: string | null
          pedido: string | null
          pieza_id: string
          png_claves: string[]
          texto_post: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "carruseles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cambiar_pilares_de_tema: {
        Args: { p_filas: Json; p_tema: string }
        Returns: undefined
      }
      cerrar_pausa_de_proveedor: { Args: { p_id: string }; Returns: boolean }
      conectar_instagram: {
        Args: { p_cuenta: string; p_expira_en: string; p_token: string }
        Returns: undefined
      }
      conectar_linkedin: {
        Args: {
          p_expira_en: string
          p_miembro: string
          p_nombre: string
          p_token: string
        }
        Returns: undefined
      }
      confirmar_costo_material: { Args: { p_id: string }; Returns: undefined }
      confirmar_gasto: {
        Args: { p_clave: string; p_real: number }
        Returns: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
          reservado_por: string | null
          sin_cobro: boolean
        }
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_autor: {
        Args: { p_credencial: string; p_nombre: string; p_tipo: string }
        Returns: string
      }
      crear_categoria: { Args: { p_nombre: string }; Returns: string }
      descartar_idea: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      descartar_ideas: {
        Args: { p_ids: string[]; p_motivo: string }
        Returns: undefined
      }
      desconectar_linkedin: { Args: never; Returns: undefined }
      deshacer_lote_de_pilares: { Args: { p_lote: string }; Returns: Json }
      editar_guion_como_coni: {
        Args: {
          p_guion: string
          p_pieza: string
          p_revision: Json
          p_texto: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      editar_texto_como_coni: {
        Args: {
          p_pieza: string
          p_revision: Json
          p_texto: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      editar_texto_linkedin_como_coni: {
        Args: {
          p_pieza: string
          p_revision: Json
          p_texto: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      es_coni: { Args: never; Returns: boolean }
      es_mantenedor: { Args: never; Returns: boolean }
      es_uuid_de_texto: { Args: { p_valor: Json }; Returns: boolean }
      espacios_simples: { Args: { p_texto: string }; Returns: string }
      excluir_afirmacion: {
        Args: { p_excluida: boolean; p_id: string }
        Returns: undefined
      }
      fijar_limite_del_mes: {
        Args: { p_limite: number }
        Returns: {
          fijado_en: string
          fijado_por: string
          limite_usd: number
          mes: string
        }
        SetofOptions: {
          from: "*"
          to: "limites_del_mes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fusionar_autores: {
        Args: { p_destino: string; p_origen: string }
        Returns: undefined
      }
      fusionar_par_de_temas: {
        Args: { p_ganador: string; p_perdedor: string }
        Returns: undefined
      }
      guardar_acortado: {
        Args: {
          p_carrusel: string
          p_clave: string
          p_explicacion: string
          p_hash_texto: string
          p_laminas: Json
          p_real: number
          p_revision: Json
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      guardar_armado: {
        Args: {
          p_carrusel: string
          p_pdf: string
          p_pngs: string[]
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      guardar_borrador: {
        Args: {
          p_clave: string
          p_guion: string
          p_pieza: string
          p_real: number
          p_respaldo?: Json
          p_revision: Json
          p_texto: string
          p_texto_linkedin?: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      guardar_carrusel: {
        Args: {
          p_clave: string
          p_hash_texto: string
          p_laminas: Json
          p_pieza: string
          p_real: number
          p_respaldo?: Json
          p_revision: Json
          p_texto_post: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      guardar_secreto: {
        Args: { p_nombre: string; p_valor: string }
        Returns: undefined
      }
      guardar_token_meta: {
        Args: { p_expira_en: string; p_token: string }
        Returns: undefined
      }
      leer_secreto: { Args: { p_nombre: string }; Returns: string }
      liberar_gasto: {
        Args: { p_clave: string; p_sin_cobro?: boolean }
        Returns: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
          reservado_por: string | null
          sin_cobro: boolean
        }
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      limite_del_mes: { Args: { p_ahora?: string }; Returns: number }
      linkedin_conectado: { Args: never; Returns: boolean }
      marcar_autor_para_borrar: {
        Args: { p_borrar: boolean; p_id: string }
        Returns: undefined
      }
      marcar_aviso_a_federico_enviado: {
        Args: { p_clave: string }
        Returns: undefined
      }
      marcar_disparo_fallido: { Args: { p_id: string }; Returns: undefined }
      marcar_inventario_revisado: { Args: never; Returns: string }
      marcar_material_para_borrar: {
        Args: { p_borrar: boolean; p_id: string }
        Returns: undefined
      }
      marcar_pausa_avisada: { Args: { p_id: string }; Returns: undefined }
      marcar_subido_como_coni: {
        Args: {
          p_destino: string
          p_enlace: string
          p_pieza: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      motor_afirmaciones_de_tema: {
        Args: { p_limite: number; p_tema: string }
        Returns: {
          autor: string
          cita: string
          dolor: string
          emocion: string
          evidencia: string
          id: string
          publico: string
          texto: string
          tipo: string
        }[]
      }
      motor_pares: {
        Args: { p_minimo_autores: number; p_por_pilares_de_red?: boolean }
        Returns: {
          a: string
          autores_comunes: number
          b: string
          puente: number
        }[]
      }
      motor_temas: {
        Args: never
        Returns: {
          afirmaciones: number
          autores: number
          cubierto_por_coni: boolean
          evidencia_fuerte: number
          nombre: string
          pilar: string
          pilares: string[]
          tema_id: string
        }[]
      }
      olvidar_visitas_clic: { Args: { p_antes_de: string }; Returns: number }
      palabras_de: { Args: { p_texto: string }; Returns: string[] }
      palabras_de_laminas: { Args: { p_laminas: Json }; Returns: string }
      pedir_cambio_de_carrusel: {
        Args: { p_pedido: string; p_pieza: string; p_version: number }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pilares_automaticos_de_tema: {
        Args: { p_filas: Json; p_tema: string }
        Returns: number
      }
      poner_material_en_cola: { Args: { p_id: string }; Returns: boolean }
      proponer_fechas: {
        Args: { p_fechas: string[]; p_piezas: string[] }
        Returns: undefined
      }
      publicar_transparencia: {
        Args: { p_motivo: string; p_texto: string }
        Returns: number
      }
      recalcular_tema: { Args: { p_tema: string }; Returns: undefined }
      rechazar_diseno_que_no_cabe: {
        Args: { p_carrusel: string; p_explicacion: string; p_version: number }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reclamar_aviso_a_federico: {
        Args: { p_clave: string; p_entidad_id: string; p_tipo: string }
        Returns: string
      }
      reclamar_aviso_de_pausa: { Args: { p_id: string }; Returns: boolean }
      registrar_clic: {
        Args: { p_dia: string; p_enlace: string; p_visitante: string }
        Returns: boolean
      }
      reintentar_material: { Args: { p_id: string }; Returns: undefined }
      renombrar_categoria: {
        Args: { p_id: string; p_nombre: string }
        Returns: undefined
      }
      reprocesar_material: { Args: { p_id: string }; Returns: undefined }
      reservar_envio_linkedin: {
        Args: { p_pieza: string; p_version: number }
        Returns: number
      }
      reservar_gasto: {
        Args: {
          p_ahora?: string
          p_clave: string
          p_estimado: number
          p_firmado?: boolean
          p_paso: string
          p_pieza: string
          p_proveedor: string
          p_reabrir?: boolean
          p_reservado_por?: string
        }
        Returns: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
          reservado_por: string | null
          sin_cobro: boolean
        }
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reservar_gasto_general: {
        Args: {
          p_ahora?: string
          p_clave: string
          p_estimado: number
          p_paso: string
          p_proveedor: string
        }
        Returns: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
          reservado_por: string | null
          sin_cobro: boolean
        }
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolver_filas_de_pilares: {
        Args: { p_filas: Json }
        Returns: {
          es_capa: boolean
          fuerza: string
          pilar_id: string
          red: string
        }[]
      }
      respaldo_de_idea: {
        Args: { p_idea: string; p_limite: number }
        Returns: Json
      }
      restaurar_ideas: { Args: { p_ids: string[] }; Returns: string[] }
      siguiente_version_de_guion: { Args: { p_pieza: string }; Returns: number }
      soltar_aviso_a_federico: { Args: { p_clave: string }; Returns: undefined }
      soltar_aviso_de_pausa: { Args: { p_id: string }; Returns: undefined }
      tema_mas_cercano: {
        Args: { p_umbral: number; p_vector: string }
        Returns: {
          similitud: number
          tema_id: string
        }[]
      }
      temas_de_pilar: {
        Args: { p_pilar: string }
        Returns: {
          actualizado_en: string | null
          afirmaciones: number | null
          alias: string[] | null
          autores: number | null
          categoria_id: string | null
          creado_en: string | null
          cubierto_por_coni: boolean | null
          descripcion: string | null
          evidencia: Json | null
          id: string | null
          nombre: string | null
          ultima_afirmacion: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "temas_resumen"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      temas_de_red: {
        Args: { p_pilar?: string; p_red: string }
        Returns: {
          actualizado_en: string
          afirmaciones: number
          alias: string[]
          autores: number
          categoria_id: string
          creado_en: string
          cubierto_por_coni: boolean
          descripcion: string
          evidencia: Json
          id: string
          nombre: string
          tratado: boolean
          ultima_afirmacion: string
        }[]
      }
      temas_parecidos: {
        Args: { p_umbral: number }
        Returns: {
          a: string
          b: string
          similitud: number
        }[]
      }
      tomar_para_publicar: {
        Args: { p_ahora: string; p_arriendo_segundos?: number }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          cambios_de_texto: number
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          pedido_de_cambio: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_carrusel_id: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          tipo: string
          titulo: string
          version: number
          video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      transparencia_vigente: {
        Args: never
        Returns: {
          creada_en: string
          texto: string
        }[]
      }
      unaccent_inmutable: { Args: { texto: string }; Returns: string }
      volver_a_transparencia: { Args: { p_version: number }; Returns: number }
    }
    Enums: {
      estado_pieza:
        | "idea"
        | "guion_en_proceso"
        | "guion_por_aprobar"
        | "guion_aprobado"
        | "grabando_voz"
        | "en_render"
        | "subtitulando"
        | "video_por_aprobar"
        | "armando_carrusel"
        | "carrusel_por_aprobar"
        | "programado"
        | "publicado"
        | "error_produccion"
        | "error_publicacion"
        | "descartado"
        | "para_subir_a_mano"
        | "publicado_a_mano"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      estado_pieza: [
        "idea",
        "guion_en_proceso",
        "guion_por_aprobar",
        "guion_aprobado",
        "grabando_voz",
        "en_render",
        "subtitulando",
        "video_por_aprobar",
        "armando_carrusel",
        "carrusel_por_aprobar",
        "programado",
        "publicado",
        "error_produccion",
        "error_publicacion",
        "descartado",
        "para_subir_a_mano",
        "publicado_a_mano",
      ],
    },
  },
} as const

